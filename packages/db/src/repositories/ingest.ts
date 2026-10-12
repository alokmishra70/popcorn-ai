import {
  SpanAttr,
  computeCost,
  defaultPriceTable,
  detectFlags,
  findRootSpan,
  listSteps,
  sumUsage,
  type PriceTable,
  type RunStatus,
  type SpanPayload,
  type StoredSpan,
} from '@popcornai/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { toStoredSpan } from '../mappers';
import { fixtures, projects, runs, spans, type Project } from '../schema';

export const RUNS_CHANNEL = 'popcorn_runs';

export interface IngestResult {
  accepted: number;
  /** Spans skipped because their run belongs to a different project. */
  rejected: number;
  runIds: string[];
}

export interface RunNotification {
  projectId: string;
  runId: string;
  status: RunStatus;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Stores a batch of spans and refreshes the runs they belong to. Idempotent on
 * span id, so a batch the SDK retries after a timeout is not double counted.
 */
export async function ingestSpans(
  db: Database,
  project: Pick<Project, 'id' | 'costThresholdUsd' | 'maxSteps'>,
  batch: readonly SpanPayload[],
  prices: PriceTable = defaultPriceTable,
): Promise<IngestResult> {
  const byRun = new Map<string, SpanPayload[]>();
  for (const span of batch) {
    const list = byRun.get(span.runId) ?? [];
    list.push(span);
    byRun.set(span.runId, list);
  }

  return db.transaction(async (tx) => {
    const ownedRunIds = await claimRuns(tx, project.id, byRun);
    const accepted = batch.filter((s) => ownedRunIds.has(s.runId));

    if (accepted.length > 0) {
      await tx
        .insert(spans)
        .values(accepted.map((span) => toSpanRow(project.id, span, prices)))
        .onConflictDoNothing({ target: spans.id });

      const toolSpans = accepted.filter(
        (s) => s.kind === 'tool' && typeof s.attributes?.[SpanAttr.ArgsHash] === 'string',
      );
      // Replayed runs read fixtures; they never become fixtures themselves.
      const recordable = toolSpans.filter((s) => s.attributes?.[SpanAttr.Fixture] === undefined);
      if (recordable.length > 0) {
        await tx
          .insert(fixtures)
          .values(
            recordable.map((span) => ({
              runId: span.runId,
              spanId: span.id,
              toolName: span.name,
              argsHash: span.attributes![SpanAttr.ArgsHash] as string,
              result: span.status === 'error' ? (span.error ?? null) : (span.output ?? null),
              isError: span.status === 'error',
              startMs: span.startTime,
            })),
          )
          .onConflictDoNothing({ target: fixtures.spanId });
      }
    }

    const runIds = [...ownedRunIds];
    for (const runId of runIds) {
      const status = await refreshRun(tx, project, runId);
      const payload: RunNotification = { projectId: project.id, runId, status };
      await tx.execute(sql`select pg_notify(${RUNS_CHANNEL}, ${JSON.stringify(payload)})`);
    }

    return { accepted: accepted.length, rejected: batch.length - accepted.length, runIds };
  });
}

/**
 * Creates placeholder rows for new runs and returns the run ids this project
 * may write to. A run id that already belongs to another project is refused.
 */
async function claimRuns(
  tx: Tx,
  projectId: string,
  byRun: Map<string, SpanPayload[]>,
): Promise<Set<string>> {
  const placeholders = [...byRun.entries()].map(([runId, list]) => {
    const root = list.find((s) => s.parentId === null);
    const earliest = Math.min(...list.map((s) => s.startTime));
    return {
      id: runId,
      projectId,
      name: root?.name ?? list[0]!.name,
      status: 'running' as const,
      startedAt: new Date(root?.startTime ?? earliest),
    };
  });
  await tx.insert(runs).values(placeholders).onConflictDoNothing({ target: runs.id });

  // Lock in id order: concurrent batches for the same run serialize here, so the
  // aggregate refresh below always sees every committed span.
  const owned = await tx
    .select({ id: runs.id })
    .from(runs)
    .where(and(inArray(runs.id, [...byRun.keys()]), eq(runs.projectId, projectId)))
    .orderBy(runs.id)
    .for('update');
  return new Set(owned.map((r) => r.id));
}

function toSpanRow(projectId: string, span: SpanPayload, prices: PriceTable) {
  return {
    id: span.id,
    runId: span.runId,
    projectId,
    parentId: span.parentId,
    kind: span.kind,
    name: span.name,
    status: span.status,
    startMs: span.startTime,
    endMs: span.endTime,
    input: span.input ?? null,
    output: span.output ?? null,
    error: span.error ?? null,
    provider: span.provider ?? null,
    model: span.model ?? null,
    tokensIn: span.usage?.inputTokens ?? null,
    tokensOut: span.usage?.outputTokens ?? null,
    cacheReadTokens: span.usage?.cacheReadTokens ?? null,
    cacheWriteTokens: span.usage?.cacheWriteTokens ?? null,
    costUsd: span.kind === 'llm' ? computeCost(span.model, span.usage, prices) : null,
    attributes: span.attributes ?? null,
  };
}

/** Recomputes a run's aggregates and flags from all of its stored spans. */
async function refreshRun(
  tx: Tx,
  project: Pick<Project, 'costThresholdUsd' | 'maxSteps'>,
  runId: string,
): Promise<RunStatus> {
  const rows = await tx.select().from(spans).where(eq(spans.runId, runId));
  const stored: StoredSpan[] = rows.map(toStoredSpan);
  const root = findRootSpan(stored);
  const usage = sumUsage(stored);
  const status: RunStatus = !root ? 'running' : root.status === 'error' ? 'error' : 'ok';
  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((v): v is string => !!v))].sort();

  const replayOf = root?.attributes?.[SpanAttr.ReplayOf];
  const evalRunId = root?.attributes?.[SpanAttr.EvalRunId];

  await tx
    .update(runs)
    .set({
      status,
      name: root?.name ?? sql`${runs.name}`,
      ...(root
        ? { startedAt: new Date(root.startTime), durationMs: root.endTime - root.startTime }
        : {}),
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: usage.costUsd,
      flags: detectFlags(stored, {
        costThresholdUsd: project.costThresholdUsd,
        maxSteps: project.maxSteps,
        loopRepeats: 3,
      }),
      spanCount: stored.length,
      stepCount: listSteps(stored).length,
      models: unique(stored.map((s) => s.model)),
      tools: unique(stored.filter((s) => s.kind === 'tool').map((s) => s.name)),
      input: root?.input ?? null,
      output: root?.output ?? null,
      error:
        root?.error?.message ?? stored.find((s) => s.status === 'error')?.error?.message ?? null,
      replayOfRunId: typeof replayOf === 'string' ? replayOf : null,
      evalRunId: typeof evalRunId === 'string' ? evalRunId : null,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, runId));

  return status;
}

export async function getProjectThresholds(db: Database, projectId: string) {
  const [row] = await db
    .select({
      id: projects.id,
      costThresholdUsd: projects.costThresholdUsd,
      maxSteps: projects.maxSteps,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row;
}

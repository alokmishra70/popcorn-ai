import type { RunFlag, RunStatus, StoredSpan } from '@popcorn-ai/core';
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../client';
import { toStoredSpan } from '../mappers';
import { fixtures, runs, spans, type Run } from '../schema';

export interface RunFilters {
  status?: RunStatus;
  /** Runs with any of these flags. */
  flags?: RunFlag[];
  /** Only runs with at least one flag ("Bloopers"). */
  flagged?: boolean;
  model?: string;
  tool?: string;
  name?: string;
  from?: Date;
  to?: Date;
  minCostUsd?: number;
  /** Full-text search over span inputs and outputs. */
  search?: string;
  replayOf?: string;
  /** Exclude runs created by `popcorn review`. Default false. */
  excludeEvals?: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type RunListItem = Omit<Run, 'input' | 'output'>;

const MAX_PAGE = 200;

interface Cursor {
  startedAt: string;
  id: string;
}

const encodeCursor = (run: Pick<Run, 'startedAt' | 'id'>) =>
  Buffer.from(
    JSON.stringify({ startedAt: run.startedAt.toISOString(), id: run.id } satisfies Cursor),
  ).toString('base64url');

function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
    return typeof parsed.startedAt === 'string' && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function filterConditions(projectId: string, filters: RunFilters): SQL[] {
  const conditions: SQL[] = [eq(runs.projectId, projectId)];
  if (filters.status) conditions.push(eq(runs.status, filters.status));
  if (filters.flags?.length) conditions.push(arrayOverlaps(runs.flags, filters.flags));
  if (filters.flagged) conditions.push(sql`cardinality(${runs.flags}) > 0`);
  if (filters.model) conditions.push(arrayContains(runs.models, [filters.model]));
  if (filters.tool) conditions.push(arrayContains(runs.tools, [filters.tool]));
  if (filters.name) conditions.push(ilike(runs.name, `%${escapeLike(filters.name)}%`));
  if (filters.from) conditions.push(gte(runs.startedAt, filters.from));
  if (filters.to) conditions.push(lte(runs.startedAt, filters.to));
  if (filters.minCostUsd !== undefined) conditions.push(gte(runs.costUsd, filters.minCostUsd));
  if (filters.replayOf) conditions.push(eq(runs.replayOfRunId, filters.replayOf));
  if (filters.excludeEvals) conditions.push(sql`${runs.evalRunId} is null`);
  if (filters.search?.trim()) {
    conditions.push(sql`exists (
      select 1 from ${spans}
      where ${spans.runId} = ${runs.id}
        and to_tsvector('simple', left(coalesce(${spans.input}::text, '') || ' ' || coalesce(${spans.output}::text, ''), 200000))
            @@ plainto_tsquery('simple', ${filters.search.trim()})
    )`);
  }
  return conditions;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Runs newest first, keyset-paginated (FR-1.7, FR-2.3). */
export async function listRuns(
  db: Database,
  projectId: string,
  filters: RunFilters = {},
  page: { cursor?: string | null; limit?: number } = {},
): Promise<Page<RunListItem>> {
  const limit = Math.min(Math.max(page.limit ?? 50, 1), MAX_PAGE);
  const conditions = filterConditions(projectId, filters);

  const cursor = page.cursor ? decodeCursor(page.cursor) : null;
  if (cursor) {
    const startedAt = new Date(cursor.startedAt);
    conditions.push(
      or(
        lt(runs.startedAt, startedAt),
        and(eq(runs.startedAt, startedAt), lt(runs.id, cursor.id)),
      )!,
    );
  }

  const { input: _input, output: _output, ...columns } = getTableColumns(runs);
  const rows = await db
    .select(columns)
    .from(runs)
    .where(and(...conditions))
    .orderBy(desc(runs.startedAt), desc(runs.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
  };
}

export async function countRuns(
  db: Database,
  projectId: string,
  filters: RunFilters = {},
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(runs)
    .where(and(...filterConditions(projectId, filters)));
  return row?.count ?? 0;
}

export interface RunDetail {
  run: Run;
  spans: StoredSpan[];
}

export async function getRun(
  db: Database,
  projectId: string,
  runId: string,
): Promise<RunDetail | null> {
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.projectId, projectId)));
  if (!run) return null;
  const rows = await db
    .select()
    .from(spans)
    .where(eq(spans.runId, runId))
    .orderBy(asc(spans.startMs));
  return { run, spans: rows.map(toStoredSpan) };
}

export interface ReplayBundleRecord {
  run: { id: string; name: string; input: unknown };
  spans: StoredSpan[];
  fixtures: Array<{ toolName: string; argsHash: string; result: unknown; isError: boolean }>;
}

/** Everything `popcorn.rewind` needs to re-run a recorded run (FR-3.1, FR-3.2). */
export async function getReplayBundle(
  db: Database,
  projectId: string,
  runId: string,
): Promise<ReplayBundleRecord | null> {
  const detail = await getRun(db, projectId, runId);
  if (!detail) return null;

  // A replay of a replay should still serve the fixtures recorded by the very first run.
  const sourceRunId = detail.run.replayOfRunId
    ? await findOriginalRun(db, detail.run.replayOfRunId)
    : runId;
  const rows = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.runId, sourceRunId))
    .orderBy(asc(fixtures.startMs));

  return {
    run: { id: detail.run.id, name: detail.run.name, input: detail.run.input },
    spans: detail.spans,
    fixtures: rows.map((f) => ({
      toolName: f.toolName,
      argsHash: f.argsHash,
      result: f.result,
      isError: f.isError,
    })),
  };
}

async function findOriginalRun(db: Database, runId: string, depth = 0): Promise<string> {
  if (depth > 20) return runId;
  const [row] = await db
    .select({ replayOf: runs.replayOfRunId })
    .from(runs)
    .where(eq(runs.id, runId));
  return row?.replayOf ? findOriginalRun(db, row.replayOf, depth + 1) : runId;
}

export interface RunFacets {
  names: string[];
  models: string[];
  tools: string[];
}

/** Distinct values for the filter dropdowns, from the last 30 days of runs. */
export async function getRunFacets(db: Database, projectId: string): Promise<RunFacets> {
  const since = sql`now() - interval '30 days'`;
  const result = await db.execute<{
    names: string[] | null;
    models: string[] | null;
    tools: string[] | null;
  }>(sql`
    select
      (select array_agg(distinct name order by name) from ${runs} where project_id = ${projectId} and started_at > ${since}) as names,
      (select array_agg(distinct m order by m) from ${runs}, unnest(models) m where project_id = ${projectId} and started_at > ${since}) as models,
      (select array_agg(distinct t order by t) from ${runs}, unnest(tools) t where project_id = ${projectId} and started_at > ${since}) as tools
  `);
  const row = result[0];
  return { names: row?.names ?? [], models: row?.models ?? [], tools: row?.tools ?? [] };
}

/** Recent runs inserted or updated after `since`; used by the live tail as a fallback to NOTIFY. */
export async function listRunsUpdatedSince(
  db: Database,
  projectId: string,
  since: Date,
  limit = 50,
) {
  const { input: _input, output: _output, ...columns } = getTableColumns(runs);
  return db
    .select(columns)
    .from(runs)
    .where(and(eq(runs.projectId, projectId), gte(runs.updatedAt, since)))
    .orderBy(desc(runs.updatedAt))
    .limit(limit);
}

export async function getRunSummary(db: Database, runId: string) {
  const { input: _input, output: _output, ...columns } = getTableColumns(runs);
  const [row] = await db.select(columns).from(runs).where(eq(runs.id, runId));
  return row ?? null;
}

import {
  aggregate,
  collapseAttempts,
  type CheckResult,
  type CollapsedOutcome,
  type EvalRunOutcome,
} from '@popcorn-ai/core';
import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../client';
import {
  datasets,
  evalResults,
  evalRuns,
  testCases,
  type Dataset,
  type EvalResult,
  type EvalRun,
} from '../schema';

export interface NewEvalResult {
  testCaseId: string;
  runId: string | null;
  attempt: number;
  passed: boolean;
  checkResults: CheckResult[];
  costUsd: number;
  durationMs: number;
  error?: string | null;
}

export interface NewEvalRun {
  /** Client-chosen id, so the runs an eval produces can be tagged with it before it is stored. */
  id?: string;
  projectId: string;
  datasetId: string;
  gitSha?: string | null;
  gitBranch?: string | null;
  label?: string | null;
  model?: string | null;
  promptHash?: string | null;
  repeat: number;
  startedAt: Date;
  finishedAt: Date;
  results: NewEvalResult[];
}

const judgeReasonOf = (checks: CheckResult[]) =>
  checks
    .filter((c) => c.type === 'llm_judge' && c.reason)
    .map((c) => c.reason)
    .join('\n') || null;

/** Stores one suite execution with all of its per-case results. */
export async function recordEvalRun(db: Database, input: NewEvalRun): Promise<EvalRun> {
  const names = await db
    .select({ id: testCases.id, name: testCases.name })
    .from(testCases)
    .where(eq(testCases.datasetId, input.datasetId));
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  const collapsed = collapseAttempts(
    input.results.map((r) => ({
      testCaseId: r.testCaseId,
      name: nameById.get(r.testCaseId) ?? r.testCaseId,
      passed: r.passed,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      attempt: r.attempt,
    })),
  );
  const summary = aggregate(collapsed);

  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(evalRuns)
      .values({
        ...(input.id ? { id: input.id } : {}),
        projectId: input.projectId,
        datasetId: input.datasetId,
        gitSha: input.gitSha ?? null,
        gitBranch: input.gitBranch ?? null,
        label: input.label ?? null,
        model: input.model ?? null,
        promptHash: input.promptHash ?? null,
        repeat: input.repeat,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        total: summary.total,
        passed: summary.passed,
        passRate: summary.passRate,
        // Total spend across every attempt, not the per-case average.
        costUsd: input.results.reduce((sum, r) => sum + r.costUsd, 0),
        p95LatencyMs: summary.p95LatencyMs,
      })
      .returning();

    if (input.results.length > 0) {
      await tx.insert(evalResults).values(
        input.results.map((r) => ({
          evalRunId: run!.id,
          testCaseId: r.testCaseId,
          runId: r.runId,
          attempt: r.attempt,
          passed: r.passed,
          checkResults: r.checkResults,
          judgeReason: judgeReasonOf(r.checkResults),
          costUsd: r.costUsd,
          durationMs: r.durationMs,
          error: r.error ?? null,
        })),
      );
    }
    return run!;
  });
}

export interface EvalResultView extends EvalResult {
  testCaseName: string;
}

export interface EvalRunDetail {
  evalRun: EvalRun;
  dataset: Dataset;
  results: EvalResultView[];
  cases: CollapsedOutcome[];
}

export async function getEvalRun(
  db: Database,
  projectId: string,
  evalRunId: string,
): Promise<EvalRunDetail | null> {
  const [row] = await db
    .select({ evalRun: evalRuns, dataset: datasets })
    .from(evalRuns)
    .innerJoin(datasets, eq(datasets.id, evalRuns.datasetId))
    .where(and(eq(evalRuns.id, evalRunId), eq(evalRuns.projectId, projectId)));
  if (!row) return null;

  const results = await db
    .select({ result: evalResults, testCaseName: testCases.name })
    .from(evalResults)
    .innerJoin(testCases, eq(testCases.id, evalResults.testCaseId))
    .where(eq(evalResults.evalRunId, evalRunId))
    .orderBy(asc(testCases.name), asc(evalResults.attempt));

  const views = results.map((r) => ({ ...r.result, testCaseName: r.testCaseName }));
  return {
    evalRun: row.evalRun,
    dataset: row.dataset,
    results: views,
    cases: collapseAttempts(
      views.map((r) => ({
        testCaseId: r.testCaseId,
        name: r.testCaseName,
        passed: r.passed,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
        attempt: r.attempt,
      })),
    ),
  };
}

export function toEvalOutcome(detail: EvalRunDetail): EvalRunOutcome {
  return { id: detail.evalRun.id, cases: detail.cases };
}

export interface EvalRunListItem extends EvalRun {
  datasetName: string;
}

export async function listEvalRuns(
  db: Database,
  projectId: string,
  options: { datasetId?: string; limit?: number } = {},
): Promise<EvalRunListItem[]> {
  const rows = await db
    .select({ evalRun: evalRuns, datasetName: datasets.name })
    .from(evalRuns)
    .innerJoin(datasets, eq(datasets.id, evalRuns.datasetId))
    .where(
      and(
        eq(evalRuns.projectId, projectId),
        options.datasetId ? eq(evalRuns.datasetId, options.datasetId) : undefined,
      ),
    )
    .orderBy(desc(evalRuns.startedAt))
    .limit(Math.min(options.limit ?? 50, 200));
  return rows.map((r) => ({ ...r.evalRun, datasetName: r.datasetName }));
}

/** The most recent eval run of a dataset on a branch, usually main: what a PR is compared against. */
export async function findBaselineEvalRun(
  db: Database,
  datasetId: string,
  branch: string,
  excludeId?: string,
): Promise<EvalRun | null> {
  const [row] = await db
    .select()
    .from(evalRuns)
    .where(
      and(
        eq(evalRuns.datasetId, datasetId),
        eq(evalRuns.gitBranch, branch),
        excludeId ? ne(evalRuns.id, excludeId) : undefined,
      ),
    )
    .orderBy(desc(evalRuns.startedAt))
    .limit(1);
  return row ?? null;
}

/** Marks a judge verdict right or wrong by hand (FR-4.7). `null` clears the review. */
export async function setJudgeVerdict(
  db: Database,
  projectId: string,
  resultId: string,
  correct: boolean | null,
): Promise<boolean> {
  const rows = await db
    .update(evalResults)
    .set({ judgeVerdictCorrect: correct })
    .where(
      and(
        eq(evalResults.id, resultId),
        sql`${evalResults.evalRunId} in (select id from ${evalRuns} where ${evalRuns.projectId} = ${projectId})`,
      ),
    )
    .returning({ id: evalResults.id });
  return rows.length > 0;
}

export interface JudgeAgreement {
  reviewed: number;
  agreed: number;
  rate: number | null;
}

export async function getJudgeAgreement(db: Database, projectId: string): Promise<JudgeAgreement> {
  const [row] = await db
    .select({
      reviewed: sql<number>`count(*)::int`,
      agreed: sql<number>`count(*) filter (where ${evalResults.judgeVerdictCorrect})::int`,
    })
    .from(evalResults)
    .innerJoin(evalRuns, eq(evalRuns.id, evalResults.evalRunId))
    .where(and(eq(evalRuns.projectId, projectId), isNotNull(evalResults.judgeVerdictCorrect)));
  const reviewed = row?.reviewed ?? 0;
  const agreed = row?.agreed ?? 0;
  return { reviewed, agreed, rate: reviewed ? agreed / reviewed : null };
}

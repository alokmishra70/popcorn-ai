import type { Check } from '@popcornai/core';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { datasets, evalRuns, runs, testCases, type Dataset, type TestCase } from '../schema';

export interface DatasetSummary extends Dataset {
  caseCount: number;
  lastPassRate: number | null;
  lastEvalAt: Date | null;
}

export async function listDatasets(db: Database, projectId: string): Promise<DatasetSummary[]> {
  const caseCount = db
    .select({ datasetId: testCases.datasetId, count: sql<number>`count(*)::int`.as('count') })
    .from(testCases)
    .groupBy(testCases.datasetId)
    .as('case_count');

  const latest = db
    .selectDistinctOn([evalRuns.datasetId], {
      datasetId: evalRuns.datasetId,
      passRate: evalRuns.passRate,
      startedAt: evalRuns.startedAt,
    })
    .from(evalRuns)
    .orderBy(evalRuns.datasetId, desc(evalRuns.startedAt))
    .as('latest');

  const rows = await db
    .select({
      dataset: datasets,
      caseCount: sql<number>`coalesce(${caseCount.count}, 0)`,
      lastPassRate: latest.passRate,
      lastEvalAt: latest.startedAt,
    })
    .from(datasets)
    .leftJoin(caseCount, eq(caseCount.datasetId, datasets.id))
    .leftJoin(latest, eq(latest.datasetId, datasets.id))
    .where(eq(datasets.projectId, projectId))
    .orderBy(asc(datasets.name));

  return rows.map((r) => ({
    ...r.dataset,
    caseCount: r.caseCount,
    lastPassRate: r.lastPassRate,
    lastEvalAt: r.lastEvalAt,
  }));
}

export async function getDataset(
  db: Database,
  projectId: string,
  idOrName: string,
): Promise<Dataset | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrName);
  const [row] = await db
    .select()
    .from(datasets)
    .where(
      and(
        eq(datasets.projectId, projectId),
        isUuid ? eq(datasets.id, idOrName) : eq(datasets.name, idOrName),
      ),
    );
  return row ?? null;
}

export async function ensureDataset(
  db: Database,
  projectId: string,
  name: string,
  agentName?: string | null,
): Promise<Dataset> {
  const [created] = await db
    .insert(datasets)
    .values({ projectId, name, agentName: agentName ?? null })
    .onConflictDoNothing({ target: [datasets.projectId, datasets.name] })
    .returning();
  if (created) return created;

  const existing = (await getDataset(db, projectId, name))!;
  if (!existing.agentName && agentName) {
    await db.update(datasets).set({ agentName }).where(eq(datasets.id, existing.id));
    return { ...existing, agentName };
  }
  return existing;
}

export async function listTestCases(db: Database, datasetId: string): Promise<TestCase[]> {
  return db
    .select()
    .from(testCases)
    .where(eq(testCases.datasetId, datasetId))
    .orderBy(asc(testCases.createdAt));
}

export interface NewTestCase {
  name?: string;
  input?: unknown;
  expected?: unknown;
  checks?: Check[];
  sourceRunId?: string | null;
  /** Agent that runs this case; taken from the source run when there is one. */
  agentName?: string | null;
}

export class SourceRunNotFoundError extends Error {
  override readonly name = 'SourceRunNotFoundError';
}

/**
 * Adds a test case to a dataset, creating the dataset if needed (FR-4.1). When
 * `sourceRunId` is given, the run's input and agent name are copied from it.
 */
export async function addTestCase(
  db: Database,
  projectId: string,
  datasetName: string,
  input: NewTestCase,
): Promise<TestCase> {
  let caseInput = input.input;
  let agentName: string | null = input.agentName ?? null;
  let defaultName = input.name;

  if (input.sourceRunId) {
    const [run] = await db
      .select({ name: runs.name, input: runs.input })
      .from(runs)
      .where(and(eq(runs.id, input.sourceRunId), eq(runs.projectId, projectId)));
    if (!run) throw new SourceRunNotFoundError(`run ${input.sourceRunId} not found`);
    caseInput ??= run.input;
    agentName = run.name;
    defaultName ??= `${run.name} ${input.sourceRunId.slice(0, 8)}`;
  }

  const dataset = await ensureDataset(db, projectId, datasetName, agentName);
  const [row] = await db
    .insert(testCases)
    .values({
      datasetId: dataset.id,
      sourceRunId: input.sourceRunId ?? null,
      name: defaultName ?? `case ${new Date().toISOString()}`,
      input: caseInput ?? null,
      expected: input.expected ?? null,
      checks: input.checks ?? [],
    })
    .returning();
  return row!;
}

export async function deleteTestCase(
  db: Database,
  datasetId: string,
  testCaseId: string,
): Promise<boolean> {
  const rows = await db
    .delete(testCases)
    .where(and(eq(testCases.id, testCaseId), eq(testCases.datasetId, datasetId)))
    .returning({ id: testCases.id });
  return rows.length > 0;
}

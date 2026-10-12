import { compareEvalRuns } from '@popcornai/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import { addTestCase, listDatasets, SourceRunNotFoundError } from '../src/repositories/datasets';
import {
  findBaselineEvalRun,
  getEvalRun,
  getJudgeAgreement,
  recordEvalRun,
  setJudgeVerdict,
  toEvalOutcome,
} from '../src/repositories/evals';
import { ingestSpans } from '../src/repositories/ingest';
import { authenticateApiKey, createApiKey, revokeApiKey } from '../src/repositories/projects';
import type { Project } from '../src/schema';
import { TEST_DATABASE_URL, openTestDb, resetDb } from './setup';
import { makeRun } from './spans';

describe.skipIf(!TEST_DATABASE_URL)('datasets and evals', () => {
  let handle: DbHandle;
  let project: Project;

  beforeAll(async () => {
    handle = await openTestDb();
  });
  afterAll(() => handle?.close());
  beforeEach(async () => {
    project = await resetDb(handle);
  });

  it('saves a run as a test case and creates the dataset on first use', async () => {
    const run = makeRun({ name: 'support-triage' });
    await ingestSpans(handle.db, project, [run.root()]);

    const testCase = await addTestCase(handle.db, project.id, 'support-v1', {
      sourceRunId: run.runId,
      expected: { category: 'shipping' },
      checks: [{ type: 'output_equals', path: 'category', value: 'shipping' }],
    });

    expect(testCase.input).toEqual({ ticket: 'Where is my order A-1001?' });
    const [dataset] = await listDatasets(handle.db, project.id);
    expect(dataset).toMatchObject({
      name: 'support-v1',
      agentName: 'support-triage',
      caseCount: 1,
    });

    await expect(
      addTestCase(handle.db, project.id, 'support-v1', { sourceRunId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(SourceRunNotFoundError);
  });

  it('records eval runs, finds the baseline on main and compares', async () => {
    const a = await addTestCase(handle.db, project.id, 'suite', { name: 'a', input: 1 });
    const b = await addTestCase(handle.db, project.id, 'suite', { name: 'b', input: 2 });
    const datasetId = a.datasetId;
    const result = (testCaseId: string, passed: boolean, attempt = 0) => ({
      testCaseId,
      runId: null,
      attempt,
      passed,
      checkResults: [
        { name: 'judge', type: 'llm_judge' as const, passed, reason: passed ? 'good' : 'bad' },
      ],
      costUsd: 0.01,
      durationMs: 1000,
    });
    const times = {
      startedAt: new Date(),
      finishedAt: new Date(),
      repeat: 1,
      projectId: project.id,
      datasetId,
    };

    const main = await recordEvalRun(handle.db, {
      ...times,
      gitBranch: 'main',
      results: [result(a.id, true), result(b.id, false)],
    });
    const pr = await recordEvalRun(handle.db, {
      ...times,
      repeat: 2,
      gitBranch: 'feature',
      results: [
        result(a.id, false),
        result(a.id, true, 1),
        result(b.id, true),
        result(b.id, true, 1),
      ],
    });

    expect(pr).toMatchObject({ total: 2, passed: 1, passRate: 0.5, costUsd: 0.04 });
    const baseline = await findBaselineEvalRun(handle.db, datasetId, 'main', pr.id);
    expect(baseline!.id).toBe(main.id);

    const current = await getEvalRun(handle.db, project.id, pr.id);
    const previous = await getEvalRun(handle.db, project.id, main.id);
    expect(current!.cases.find((c) => c.name === 'a')).toMatchObject({
      flaky: true,
      passed: false,
    });
    const comparison = compareEvalRuns(toEvalOutcome(current!), toEvalOutcome(previous!));
    expect(comparison).toMatchObject({ fixed: 1, broken: 1, regressed: true });
  });

  it('tracks judge agreement from manual reviews', async () => {
    const tc = await addTestCase(handle.db, project.id, 'suite', { name: 'a' });
    const run = await recordEvalRun(handle.db, {
      projectId: project.id,
      datasetId: tc.datasetId,
      repeat: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
      results: [0, 1, 2].map((attempt) => ({
        testCaseId: tc.id,
        runId: null,
        attempt,
        passed: true,
        checkResults: [],
        costUsd: 0,
        durationMs: 0,
      })),
    });
    const detail = await getEvalRun(handle.db, project.id, run.id);
    const [r1, r2] = detail!.results;
    await setJudgeVerdict(handle.db, project.id, r1!.id, true);
    await setJudgeVerdict(handle.db, project.id, r2!.id, false);
    expect(await getJudgeAgreement(handle.db, project.id)).toEqual({
      reviewed: 2,
      agreed: 1,
      rate: 0.5,
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('api keys', () => {
  let handle: DbHandle;
  let project: Project;

  beforeAll(async () => {
    handle = await openTestDb();
  });
  afterAll(() => handle?.close());
  beforeEach(async () => {
    project = await resetDb(handle);
  });

  it('authenticates by hash and stops working once revoked', async () => {
    const { key, record } = await createApiKey(handle.db, project.id, 'ci');
    expect(record.hash).not.toContain(key);
    expect((await authenticateApiKey(handle.db, key))!.id).toBe(project.id);
    expect(await authenticateApiKey(handle.db, 'pk_wrong')).toBeNull();

    await revokeApiKey(handle.db, project.id, record.id);
    expect(await authenticateApiKey(handle.db, key)).toBeNull();
  });
});

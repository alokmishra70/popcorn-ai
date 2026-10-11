import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import { createProject } from '../src/repositories/projects';
import { ingestSpans } from '../src/repositories/ingest';
import { getReplayBundle, getRun, listRuns } from '../src/repositories/runs';
import type { Project } from '../src/schema';
import { TEST_DATABASE_URL, openTestDb, resetDb } from './setup';
import { makeRun } from './spans';

describe.skipIf(!TEST_DATABASE_URL)('ingestSpans', () => {
  let handle: DbHandle;
  let project: Project;

  beforeAll(async () => {
    handle = await openTestDb();
  });
  afterAll(() => handle?.close());
  beforeEach(async () => {
    project = await resetDb(handle);
  });

  it('stores spans, computes cost and aggregates the run', async () => {
    const run = makeRun();
    run.child({
      kind: 'llm',
      name: 'anthropic.messages',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1000, outputTokens: 100 },
    });
    run.child({
      kind: 'tool',
      name: 'lookup_order',
      input: { orderId: 'A-1001' },
      output: { status: 'shipped' },
      attributes: { 'popcorn.args_hash': 'h1' },
    });
    const result = await ingestSpans(handle.db, project, [...run.spans, run.root()]);

    expect(result).toEqual({ accepted: 3, rejected: 0, runIds: [run.runId] });
    const detail = await getRun(handle.db, project.id, run.runId);
    expect(detail!.run).toMatchObject({
      status: 'ok',
      name: 'support-triage',
      tokensIn: 1000,
      tokensOut: 100,
      costUsd: 0.006,
      spanCount: 3,
      stepCount: 2,
      models: ['claude-opus-5-5'],
      tools: ['lookup_order'],
      output: { category: 'shipping' },
    });
    expect(detail!.spans.find((s) => s.kind === 'llm')!.costUsd).toBe(0.006);
  });

  it('is idempotent when a batch is retried', async () => {
    const run = makeRun();
    run.child({
      kind: 'llm',
      name: 'llm',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const batch = [...run.spans, run.root()];
    await ingestSpans(handle.db, project, batch);
    await ingestSpans(handle.db, project, batch);
    const detail = await getRun(handle.db, project.id, run.runId);
    expect(detail!.spans).toHaveLength(2);
    expect(detail!.run.tokensIn).toBe(10);
  });

  it('shows a run as running until its root span arrives, across batches', async () => {
    const run = makeRun();
    run.child({ kind: 'tool', name: 'lookup_order' });
    await ingestSpans(handle.db, project, run.spans);
    expect((await getRun(handle.db, project.id, run.runId))!.run.status).toBe('running');

    await ingestSpans(handle.db, project, [
      run.root({ status: 'error', error: { message: 'boom' } }),
    ]);
    const detail = await getRun(handle.db, project.id, run.runId);
    expect(detail!.run).toMatchObject({ status: 'error', error: 'boom', flags: ['error'] });
  });

  it('refuses spans for a run owned by another project', async () => {
    const other = await createProject(handle.db, { slug: 'other', name: 'Other' });
    const run = makeRun();
    await ingestSpans(handle.db, project, [run.root()]);
    const intruder = run.child({ kind: 'tool', name: 'inject' });
    const result = await ingestSpans(handle.db, other, [intruder]);

    expect(result.rejected).toBe(1);
    expect((await getRun(handle.db, project.id, run.runId))!.spans).toHaveLength(1);
  });

  it('records tool outputs as fixtures for replay, but not from replayed runs', async () => {
    const original = makeRun();
    original.child({
      kind: 'tool',
      name: 'lookup_order',
      input: { orderId: 'A-1' },
      output: { status: 'shipped' },
      attributes: { 'popcorn.args_hash': 'h1' },
    });
    original.child({
      kind: 'tool',
      name: 'refund',
      status: 'error',
      error: { message: 'denied' },
      attributes: { 'popcorn.args_hash': 'h2' },
    });
    await ingestSpans(handle.db, project, [...original.spans, original.root()]);

    const replay = makeRun();
    replay.child({
      kind: 'tool',
      name: 'lookup_order',
      output: { status: 'shipped' },
      attributes: { 'popcorn.args_hash': 'h1', 'popcorn.fixture': 'hit' },
    });
    await ingestSpans(handle.db, project, [
      ...replay.spans,
      replay.root({ attributes: { 'popcorn.replay_of': original.runId } }),
    ]);

    const bundle = await getReplayBundle(handle.db, project.id, original.runId);
    expect(bundle!.fixtures).toEqual([
      { toolName: 'lookup_order', argsHash: 'h1', result: { status: 'shipped' }, isError: false },
      { toolName: 'refund', argsHash: 'h2', result: { message: 'denied' }, isError: true },
    ]);

    // Replaying the replay still uses the original run's fixtures.
    const nested = await getReplayBundle(handle.db, project.id, replay.runId);
    expect(nested!.fixtures).toHaveLength(2);
    expect((await getRun(handle.db, project.id, replay.runId))!.run.replayOfRunId).toBe(
      original.runId,
    );
  });

  it('flags loops and cost spikes using project thresholds', async () => {
    const run = makeRun();
    for (let i = 0; i < 3; i++)
      run.child({ kind: 'tool', name: 'search', attributes: { 'popcorn.args_hash': 'same' } });
    run.child({
      kind: 'llm',
      name: 'llm',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 200_000, outputTokens: 10_000 },
    });
    await ingestSpans(handle.db, project, [...run.spans, run.root()]);
    const { items } = await listRuns(handle.db, project.id, { flagged: true });
    expect(items[0]!.flags).toEqual(['cost_spike', 'loop']);
  });
});

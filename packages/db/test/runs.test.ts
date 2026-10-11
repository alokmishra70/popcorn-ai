import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import { ingestSpans } from '../src/repositories/ingest';
import { deleteRunsOlderThan } from '../src/repositories/retention';
import { countRuns, getRunFacets, listRuns } from '../src/repositories/runs';
import type { Project } from '../src/schema';
import { TEST_DATABASE_URL, openTestDb, resetDb } from './setup';
import { makeRun } from './spans';

describe.skipIf(!TEST_DATABASE_URL)('listRuns', () => {
  let handle: DbHandle;
  let project: Project;

  beforeAll(async () => {
    handle = await openTestDb();
  });
  afterAll(() => handle?.close());

  beforeEach(async () => {
    project = await resetDb(handle);
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const run = makeRun({
        name: i % 2 ? 'triage' : 'refund-bot',
        status: i === 4 ? 'error' : 'ok',
        startedAt: now - i * 60_000,
      });
      run.child({
        kind: 'llm',
        name: 'llm',
        model: i < 2 ? 'claude-opus-5-5' : 'claude-haiku-5-5',
        usage: { inputTokens: 1000 * (i + 1), outputTokens: 100 },
      });
      run.child({
        kind: 'tool',
        name: i === 0 ? 'issue_refund' : 'lookup_order',
        input: { note: i === 3 ? 'customer wants a replacement kettle' : 'n/a' },
      });
      await ingestSpans(handle.db, project, [...run.spans, run.root()]);
    }
  });

  it('returns newest first and paginates with a cursor', async () => {
    const first = await listRuns(handle.db, project.id, {}, { limit: 2 });
    expect(first.items).toHaveLength(2);
    const second = await listRuns(
      handle.db,
      project.id,
      {},
      { limit: 2, cursor: first.nextCursor },
    );
    const third = await listRuns(
      handle.db,
      project.id,
      {},
      { limit: 2, cursor: second.nextCursor },
    );
    const all = [...first.items, ...second.items, ...third.items];

    expect(third.nextCursor).toBeNull();
    expect(new Set(all.map((r) => r.id)).size).toBe(5);
    expect(all.map((r) => r.startedAt.getTime())).toEqual(
      [...all.map((r) => r.startedAt.getTime())].sort((a, b) => b - a),
    );
  });

  it('filters by status, model, tool, name and cost', async () => {
    expect(await countRuns(handle.db, project.id, { status: 'error' })).toBe(1);
    expect(await countRuns(handle.db, project.id, { model: 'claude-opus-5-5' })).toBe(2);
    expect(await countRuns(handle.db, project.id, { tool: 'issue_refund' })).toBe(1);
    expect(await countRuns(handle.db, project.id, { name: 'refund' })).toBe(3);
    expect(await countRuns(handle.db, project.id, { minCostUsd: 0.01 })).toBe(1);
  });

  it('searches span inputs and outputs', async () => {
    const { items } = await listRuns(handle.db, project.id, { search: 'replacement kettle' });
    expect(items).toHaveLength(1);
  });

  it('lists facets for filter dropdowns', async () => {
    expect(await getRunFacets(handle.db, project.id)).toEqual({
      names: ['refund-bot', 'triage'],
      models: ['claude-haiku-5-5', 'claude-opus-5-5'],
      tools: ['issue_refund', 'lookup_order'],
    });
  });

  it('deletes runs past the retention window with their spans', async () => {
    const old = makeRun({ startedAt: Date.now() - 40 * 86_400_000 });
    old.child({ kind: 'tool', name: 'lookup_order' });
    await ingestSpans(handle.db, project, [...old.spans, old.root()]);

    expect(await deleteRunsOlderThan(handle.db, 30)).toBe(1);
    expect(await countRuns(handle.db, project.id)).toBe(5);
  });
});

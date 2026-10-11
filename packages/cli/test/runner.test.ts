import { popcorn } from '@popcorn-ai/sdk';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api';
import { defineConfig } from '../src/config';
import { runReview } from '../src/review/runner';

const CASES = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'refund ticket',
    input: { text: 'my kettle is broken, refund please' },
    expected: null,
    checks: [
      { type: 'output_equals', path: 'category', value: 'refund' },
      { type: 'tool_called', tool: 'lookup' },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'shipping ticket',
    input: { text: 'where is my parcel' },
    expected: null,
    checks: [{ type: 'output_equals', path: 'category', value: 'shipping' }],
  },
];

function fakeApi(baseline: unknown = null) {
  const posted: unknown[] = [];
  const api = {
    get: vi.fn(async () => ({
      dataset: { id: 'd1', name: 'suite', agentName: 'classifier' },
      cases: CASES,
    })),
    find: vi.fn(async () => baseline),
    post: vi.fn(async (_path: string, body: unknown) => {
      posted.push(body);
      return {};
    }),
  } as unknown as ApiClient;
  return { api, posted };
}

const lookup = popcorn.tool('lookup', async (text: string) => text.length);

const classifier = popcorn.agent('classifier', async (input: { text: string }) => {
  await lookup(input.text);
  if (input.text.includes('parcel')) throw new Error('model timed out');
  return { category: input.text.includes('refund') ? 'refund' : 'shipping' };
});

beforeAll(() => {
  popcorn.init({ transport: { send: async () => {} }, flushIntervalMs: 60_000 });
});

describe('runReview', () => {
  it('runs every case through the agent, applies checks and uploads the results', async () => {
    const { api, posted } = fakeApi();
    const report = await runReview({
      suite: 'suite',
      config: defineConfig({ agents: { classifier } }),
      api,
    });

    expect(report.comparison.current).toMatchObject({ total: 2, passed: 1 });
    const failed = report.results.find((r) => !r.passed)!;
    expect(failed.error).toBe('model timed out');
    expect(failed.checks[0]).toMatchObject({ name: 'run completed', passed: false });
    expect(report.results.every((r) => r.runId)).toBe(true);

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ id: report.evalRunId, dataset: 'suite', repeat: 1 });
  });

  it('detects regressions against the baseline and flaky cases across repeats', async () => {
    const baseline = {
      evalRun: { id: 'base', gitSha: 'abc', gitBranch: 'main' },
      cases: CASES.map((c) => ({
        testCaseId: c.id,
        name: c.name,
        passed: true,
        costUsd: 0,
        durationMs: 10,
      })),
    };
    const { api } = fakeApi(baseline);
    const report = await runReview({
      suite: 'suite',
      config: { agents: { classifier } },
      api,
      repeat: 2,
      upload: false,
    });

    expect(report.results).toHaveLength(4);
    expect(report.comparison.broken).toBe(1);
    expect(report.comparison.regressed).toBe(true);
    expect(report.baseline?.branch).toBe('main');
    expect(report.flaky).toEqual([]);
  });

  it('fails clearly when the suite needs an agent the config does not define', async () => {
    const { api } = fakeApi();
    await expect(
      runReview({ suite: 'suite', config: { agents: { other: async () => 1 } }, api }),
    ).rejects.toThrow(/runs agent "classifier"/);
  });
});

import type { ApiClient } from '@popcornai/cli';
import { describe, expect, it } from 'vitest';
import { getRun, searchRuns } from '../src/tools';

const fakeApi = (responses: Record<string, unknown>) =>
  ({
    get: async (path: string) => {
      const key = Object.keys(responses).find((prefix) => path.startsWith(prefix));
      if (!key) throw new Error(`unexpected ${path}`);
      return responses[key];
    },
  }) as unknown as ApiClient;

const run = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'support-triage',
  status: 'error',
  startedAt: '2026-10-11T10:00:00Z',
  durationMs: 1200,
  tokensIn: 900,
  tokensOut: 100,
  costUsd: 0.0123,
  flags: ['loop'],
  stepCount: 2,
  error: 'no decision after 6 turns',
};

describe('mcp tools', () => {
  it('search_runs prints one line per run', async () => {
    const out = await searchRuns(fakeApi({ '/v1/runs?': { items: [run] } }), { flag: 'loop' });
    expect(out).toContain(run.id);
    expect(out).toContain('flags: loop');
    expect(out).toContain('error: no decision');
  });

  it('get_run lists steps with clipped payloads', async () => {
    const long = 'x'.repeat(5000);
    const out = await getRun(
      fakeApi({
        '/v1/runs/': {
          run: {
            ...run,
            input: { ticket: 'T-1' },
            output: null,
            models: ['claude-opus-5-5'],
            replayOfRunId: null,
          },
          spans: [
            {
              id: 'a',
              runId: run.id,
              parentId: null,
              kind: 'agent',
              name: 'support-triage',
              status: 'error',
              startTime: 0,
              endTime: 1200,
            },
            {
              id: 'b',
              runId: run.id,
              parentId: 'a',
              kind: 'llm',
              name: 'anthropic.messages',
              model: 'claude-opus-5-5',
              status: 'ok',
              startTime: 1,
              endTime: 400,
              output: long,
            },
            {
              id: 'c',
              runId: run.id,
              parentId: 'a',
              kind: 'tool',
              name: 'lookup_order',
              status: 'error',
              startTime: 410,
              endTime: 420,
              input: { orderId: 'A-1' },
              error: { message: 'not found' },
            },
          ],
        },
      }),
      run.id,
    );
    expect(out).toContain('0. [llm] anthropic.messages (claude-opus-5-5) ok');
    expect(out).toContain('1. [tool] lookup_order error');
    expect(out).toContain('error: not found');
    expect(out).toContain('[3500 more chars]');
  });
});

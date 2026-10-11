import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, agentRun, createTestApp } from './helpers';

describe.skipIf(!TEST_DATABASE_URL)('api', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let headers: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx?.close());
  beforeEach(async () => {
    ({ headers } = await ctx.reset());
  });

  const ingest = (spans: unknown[]) =>
    ctx.app.inject({ method: 'POST', url: '/v1/spans', headers, payload: { spans } });

  describe('auth', () => {
    it('rejects requests without a valid key', async () => {
      const missing = await ctx.app.inject({ method: 'GET', url: '/v1/runs' });
      expect(missing.statusCode).toBe(401);
      const wrong = await ctx.app.inject({
        method: 'GET',
        url: '/v1/runs',
        headers: { authorization: 'Bearer pk_nope' },
      });
      expect(wrong.json()).toMatchObject({ code: 'unauthorized' });
    });

    it('leaves health checks open', async () => {
      expect((await ctx.app.inject({ method: 'GET', url: '/readyz' })).json()).toEqual({
        status: 'ok',
        ingest: 'inline',
      });
    });
  });

  describe('POST /v1/spans', () => {
    it('accepts a valid batch with 202', async () => {
      const { spans } = agentRun();
      const response = await ingest(spans);
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ accepted: 2 });
    });

    it('returns 400 with the failing paths for invalid spans', async () => {
      const response = await ingest([{ id: 'nope', kind: 'llm' }]);
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('invalid_request');
      expect(body.issues.map((i: { path: string }) => i.path)).toContain('spans.0.id');
    });

    it('rejects an empty batch', async () => {
      expect((await ingest([])).statusCode).toBe(400);
    });
  });

  describe('runs', () => {
    it('lists, filters and returns run detail with spans', async () => {
      const { runId, spans } = agentRun();
      await ingest(spans);

      const list = await ctx.app.inject({
        method: 'GET',
        url: '/v1/runs?tool=lookup_order&limit=10',
        headers,
      });
      expect(list.json().items).toHaveLength(1);
      expect(list.json().items[0]).toMatchObject({ id: runId, status: 'ok', stepCount: 1 });

      const none = await ctx.app.inject({ method: 'GET', url: '/v1/runs?status=error', headers });
      expect(none.json().items).toHaveLength(0);

      const detail = await ctx.app.inject({ method: 'GET', url: `/v1/runs/${runId}`, headers });
      expect(detail.json().spans).toHaveLength(2);
    });

    it('returns 404 for runs of other projects and unknown ids', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: `/v1/runs/${randomUUID()}`,
        headers,
      });
      expect(response.statusCode).toBe(404);
    });

    it('serves a replay bundle with fixtures and a diff between runs', async () => {
      const a = agentRun();
      const b = agentRun();
      await ingest([...a.spans, ...b.spans]);

      const bundle = await ctx.app.inject({
        method: 'GET',
        url: `/v1/runs/${a.runId}/replay`,
        headers,
      });
      expect(bundle.json()).toMatchObject({
        run: { id: a.runId, name: 'support-triage', input: { ticket: 'where is my order?' } },
        fixtures: [
          {
            toolName: 'lookup_order',
            argsHash: 'abc',
            result: { status: 'shipped' },
            isError: false,
          },
        ],
      });

      const diff = await ctx.app.inject({
        method: 'GET',
        url: `/v1/runs/${a.runId}/diff/${b.runId}`,
        headers,
      });
      expect(diff.json().counts).toEqual({ unchanged: 1, changed: 0, added: 0, removed: 0 });
    });
  });

  describe('datasets and eval runs', () => {
    it('saves a run as a test case, records eval runs and compares against main', async () => {
      const { runId, spans } = agentRun();
      await ingest(spans);

      const created = await ctx.app.inject({
        method: 'POST',
        url: '/v1/datasets/support-v1/cases',
        headers,
        payload: {
          sourceRunId: runId,
          checks: [{ type: 'output_equals', path: 'category', value: 'shipping' }],
        },
      });
      expect(created.statusCode).toBe(201);
      const testCaseId = created.json().id;

      const suite = await ctx.app.inject({
        method: 'GET',
        url: '/v1/datasets/support-v1',
        headers,
      });
      expect(suite.json()).toMatchObject({
        dataset: { agentName: 'support-triage' },
        cases: [{ id: testCaseId }],
      });

      const post = (passed: boolean, gitBranch: string) =>
        ctx.app.inject({
          method: 'POST',
          url: '/v1/eval-runs',
          headers,
          payload: {
            dataset: 'support-v1',
            gitBranch,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            results: [
              {
                testCaseId,
                runId: null,
                attempt: 0,
                passed,
                checkResults: [],
                costUsd: 0.01,
                durationMs: 900,
              },
            ],
          },
        });

      expect((await post(true, 'main')).statusCode).toBe(201);
      const pr = await post(false, 'fix-prompt');
      const comparison = await ctx.app.inject({
        method: 'GET',
        url: `/v1/eval-runs/${pr.json().id}/compare`,
        headers,
      });
      expect(comparison.json().comparison).toMatchObject({ broken: 1, regressed: true });
    });

    it('rejects results for cases outside the dataset', async () => {
      await ctx.app.inject({
        method: 'POST',
        url: '/v1/datasets/s/cases',
        headers,
        payload: { input: 'x' },
      });
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/eval-runs',
        headers,
        payload: {
          dataset: 's',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          results: [
            {
              testCaseId: randomUUID(),
              runId: null,
              attempt: 0,
              passed: true,
              checkResults: [],
              costUsd: 0,
              durationMs: 0,
            },
          ],
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/traces (OTLP)', () => {
    it('ingests GenAI spans as a run', async () => {
      const traceId = '5b8efff798038103d269b633813fc60c';
      const ns = (ms: number) => String(BigInt(Date.now() - 10_000 + ms) * 1_000_000n);
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/traces',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: {
          resourceSpans: [
            {
              resource: {
                attributes: [{ key: 'service.name', value: { stringValue: 'py-agent' } }],
              },
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId,
                      spanId: 'aaaaaaaaaaaaaaaa',
                      name: 'invoke_agent',
                      startTimeUnixNano: ns(0),
                      endTimeUnixNano: ns(500),
                    },
                    {
                      traceId,
                      spanId: 'bbbbbbbbbbbbbbbb',
                      parentSpanId: 'aaaaaaaaaaaaaaaa',
                      name: 'chat claude-haiku-5-5',
                      startTimeUnixNano: ns(10),
                      endTimeUnixNano: ns(300),
                      attributes: [
                        { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
                        { key: 'gen_ai.request.model', value: { stringValue: 'claude-haiku-5-5' } },
                        { key: 'gen_ai.usage.input_tokens', value: { intValue: '1000000' } },
                        { key: 'gen_ai.usage.output_tokens', value: { intValue: 10 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      expect(response.statusCode).toBe(200);

      const list = await ctx.app.inject({ method: 'GET', url: '/v1/runs', headers });
      expect(list.json().items[0]).toMatchObject({
        name: 'invoke_agent',
        models: ['claude-haiku-5-5'],
        costUsd: 0.100005,
      });
    });

    it('refuses protobuf payloads with a hint', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/traces',
        headers: { ...headers, 'content-type': 'application/x-protobuf' },
        payload: Buffer.from([1, 2, 3]),
      });
      expect(response.statusCode).toBe(415);
    });
  });
});

/**
 * Node equivalent of bench/ingest.k6.js for machines without k6: sends SDK-sized
 * batches as fast as the API accepts them with fixed concurrency, then reports
 * throughput and latency.
 *
 *   pnpm --filter @popcorn-ai/api bench [seconds] [concurrency]
 */
import { randomUUID } from 'node:crypto';
import { percentile } from '@popcorn-ai/core';

const endpoint = process.env.POPCORN_ENDPOINT ?? 'http://localhost:4100';
const apiKey = process.env.POPCORN_API_KEY;
const seconds = Number(process.argv[2] ?? 20);
const concurrency = Number(process.argv[3] ?? 4);
if (!apiKey) throw new Error('POPCORN_API_KEY is required');

function batch() {
  const spans: unknown[] = [];
  const now = Date.now();
  for (let r = 0; r < 10; r++) {
    const runId = randomUUID();
    const rootId = randomUUID();
    for (let i = 0; i < 9; i++) {
      const llm = i % 2 === 0;
      spans.push({
        id: randomUUID(),
        runId,
        parentId: rootId,
        kind: llm ? 'llm' : 'tool',
        name: llm ? 'anthropic.messages' : 'lookup_order',
        startTime: now + i * 100,
        endTime: now + i * 100 + 80,
        status: 'ok',
        input: llm
          ? { messages: [{ role: 'user', content: 'Where is order A-1001?' }] }
          : { orderId: 'A-1001' },
        output: llm
          ? { content: [{ type: 'text', text: 'Looking it up.' }] }
          : { status: 'shipped' },
        ...(llm
          ? {
              provider: 'anthropic',
              model: 'claude-haiku-5-5',
              usage: { inputTokens: 1200, outputTokens: 80 },
            }
          : { attributes: { 'popcorn.args_hash': 'bench' } }),
      });
    }
    spans.push({
      id: rootId,
      runId,
      parentId: null,
      kind: 'agent',
      name: 'load-test',
      startTime: now,
      endTime: now + 1000,
      status: 'ok',
    });
  }
  return spans;
}

const latencies: number[] = [];
let spansSent = 0;
let failures = 0;
const deadline = Date.now() + seconds * 1000;

async function worker() {
  while (Date.now() < deadline) {
    const spans = batch();
    const start = performance.now();
    const response = await fetch(`${endpoint}/v1/spans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ spans }),
    });
    latencies.push(performance.now() - start);
    if (response.status === 202) spansSent += spans.length;
    else failures++;
    await response.arrayBuffer();
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = (Date.now() - started) / 1000;

console.log(
  `${spansSent.toLocaleString()} spans in ${elapsed.toFixed(1)} s with ${concurrency} concurrent clients`,
);
console.log(`throughput  ${Math.round(spansSent / elapsed).toLocaleString()} spans/s`);
console.log(
  `latency     p50 ${percentile(latencies, 50).toFixed(0)} ms, p95 ${percentile(latencies, 95).toFixed(0)} ms per 100-span batch`,
);
console.log(`failures    ${failures}`);

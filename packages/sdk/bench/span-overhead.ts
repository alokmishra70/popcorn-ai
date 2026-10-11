/**
 * Measures what the SDK adds to one tool call: span creation, args hashing,
 * context propagation, serialization and redaction. The transport discards
 * spans, so network time is excluded by design.
 *
 *   pnpm --filter @popcorn-ai/sdk bench
 */
import { performance } from 'node:perf_hooks';
import { percentile } from '@popcorn-ai/core';
import { popcorn, redactors } from '../src';

const ITERATIONS = 20_000;
const WARMUP = 2_000;

popcorn.init({
  transport: { send: async () => {} },
  redact: [redactors.email, redactors.phone],
  flushIntervalMs: 50,
  maxQueueSize: 100_000,
});

const payload = {
  orderId: 'A-1001',
  customer: { email: 'jane@example.com', tier: 'gold' },
  items: Array.from({ length: 10 }, (_, i) => ({
    sku: `SKU-${i}`,
    qty: i + 1,
    note: 'x'.repeat(200),
  })),
};

const baseline = async (input: typeof payload) => input.items.length;
const traced = popcorn.tool('lookup_order', baseline);

async function measure(fn: () => Promise<unknown>, n: number): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return samples;
}

await popcorn.trace(
  'bench',
  async () => {
    await measure(() => traced(payload), WARMUP);
    const plain = await measure(() => baseline(payload), ITERATIONS);
    const withSpan = await measure(() => traced(payload), ITERATIONS);

    const row = (label: string, samples: number[]) =>
      `${label.padEnd(10)} p50 ${percentile(samples, 50).toFixed(4)} ms   p95 ${percentile(samples, 95).toFixed(4)} ms   p99 ${percentile(samples, 99).toFixed(4)} ms`;

    console.log(`${ITERATIONS} tool calls, ~${JSON.stringify(payload).length} byte args\n`);
    console.log(row('baseline', plain));
    console.log(row('traced', withSpan));
    const overhead = percentile(withSpan, 95) - percentile(plain, 95);
    console.log(`\np95 overhead per span: ${overhead.toFixed(4)} ms (target < 5 ms)`);
  },
  { captureOutput: false },
);

await popcorn.shutdown();

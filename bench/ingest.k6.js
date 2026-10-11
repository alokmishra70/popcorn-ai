// Ingest load test (target: 500 spans/s on a 2 vCPU VM).
//
//   k6 run -e ENDPOINT=http://localhost:4100 -e API_KEY=pk_... bench/ingest.k6.js
//
// Each request is one SDK-sized batch of 100 spans across 10 runs.
import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const SPANS_PER_BATCH = 100;
const TARGET_SPANS_PER_SECOND = Number(__ENV.RATE ?? 500);

export const options = {
  scenarios: {
    ingest: {
      executor: 'constant-arrival-rate',
      rate: Math.ceil(TARGET_SPANS_PER_SECOND / SPANS_PER_BATCH),
      timeUnit: '1s',
      duration: __ENV.DURATION ?? '60s',
      preAllocatedVUs: 20,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<500'],
  },
};

function batch() {
  const spans = [];
  const now = Date.now();
  for (let r = 0; r < SPANS_PER_BATCH / 10; r++) {
    const runId = uuidv4();
    const rootId = uuidv4();
    for (let i = 0; i < 9; i++) {
      const llm = i % 2 === 0;
      spans.push({
        id: uuidv4(),
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
      name: 'k6',
      startTime: now,
      endTime: now + 1000,
      status: 'ok',
    });
  }
  return { spans };
}

export default function () {
  const response = http.post(`${__ENV.ENDPOINT}/v1/spans`, JSON.stringify(batch()), {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${__ENV.API_KEY}` },
  });
  check(response, { accepted: (r) => r.status === 202 });
}

# @popcornai/sdk

**Grab the popcorn. Watch what your agent really did.**

The tracing SDK for [Popcorn AI](https://github.com/alokmishra70/popcorn-ai), an open-source toolkit for TypeScript AI agents. Wrap your LLM client and tools once; every agent run becomes a trace you can inspect, replay against recorded tool outputs, and turn into a regression test.

- Records every model call and tool call: inputs, outputs, tokens, cost, latency, errors
- Anthropic and OpenAI clients, streaming included; neither is a dependency
- Under 0.3 ms of overhead per span, and it never throws into your code or blocks on the network
- Replays a failed run with a new prompt or model, tools served from what they returned the first time

```bash
npm install @popcornai/sdk
```

## Usage

```ts
import Anthropic from '@anthropic-ai/sdk';
import { popcorn } from '@popcornai/sdk';

const anthropic = popcorn.wrapAnthropic(new Anthropic());

const lookupOrder = popcorn.tool('lookup_order', async ({ orderId }: { orderId: string }) => {
  return db.orders.find(orderId);
});

export const supportAgent = popcorn.agent('support-agent', async (ticket: Ticket) => {
  // Your agent loop, unchanged. Model and tool calls inside are recorded,
  // including across await and parallel calls.
});

await supportAgent(ticket);
```

Configure with environment variables, or call `popcorn.init()`:

```bash
POPCORN_ENDPOINT=http://localhost:4100   # your Popcorn API
POPCORN_API_KEY=pk_...                   # project key from the dashboard
```

Short-lived processes (scripts, serverless handlers) should `await popcorn.flush()` before exiting.

## Replay a failed run

```ts
const result = await popcorn.rewind(runId, {
  overrides: { system: newPrompt, model: 'claude-sonnet-5-5' },
});

result.diff.finalOutput.changed; // did the answer change?
result.diff.steps; // step-by-step diff against the original
```

Tools return their recorded outputs, so no real API is called. A tool called with arguments that were never recorded fails the replay by default (`onFixtureMiss: 'live'` calls the real tool instead).

## Save a run as a test case

```ts
await popcorn.dataset.add(runId, {
  dataset: 'support-v1',
  checks: [
    { type: 'output_equals', path: 'category', value: 'refund' },
    { type: 'tool_called', tool: 'lookup_order' },
  ],
});
```

Then run the suite with [`@popcornai/cli`](https://www.npmjs.com/package/@popcornai/cli): `npx popcorn review --suite support-v1`.

## Redact personal data

```ts
popcorn.init({ redact: [popcorn.redactors.email, popcorn.redactors.phone] });
```

Values under auth-like keys (`authorization`, `api_key`, `password`, ...) are always stripped before export.

## API

| Function                                      | Purpose                                            |
| --------------------------------------------- | -------------------------------------------------- |
| `init(options?)`                              | Endpoint, API key, sampling, batching, redaction   |
| `agent(name, fn)`                             | Declare a replayable agent; each call is one run   |
| `trace(name, fn, options?)`                   | Record any function as a run, or a step inside one |
| `tool(name, fn, options?)`                    | Record a tool; optional in-memory result cache     |
| `wrapAnthropic(client)`, `wrapOpenAI(client)` | Instrument a client without modifying it           |
| `rewind(runId, options?)`                     | Replay with recorded tool outputs                  |
| `dataset.add(runId, options)`                 | Save a run as a test case                          |
| `flush()`, `shutdown()`                       | Send buffered spans                                |

Full reference: [SDK docs](https://github.com/alokmishra70/popcorn-ai/blob/main/docs/sdk.md).

## Running Popcorn

The SDK sends traces to a Popcorn server you host. `docker compose up` in the [repository](https://github.com/alokmishra70/popcorn-ai) starts the API, dashboard, Postgres and Redis. See the [quickstart](https://github.com/alokmishra70/popcorn-ai/blob/main/docs/quickstart.md).

Requires Node 20.11 or newer. MIT licensed.

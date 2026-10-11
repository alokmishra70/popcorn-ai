# SDK reference

```ts
import { popcorn } from '@popcorn-ai/sdk';
```

Every function is also a named export.

## popcorn.init(options?)

Configures the SDK. Optional: without it, settings come from environment variables on first use.

| Option            | Default                                       | Description                                             |
| ----------------- | --------------------------------------------- | ------------------------------------------------------- |
| `endpoint`        | `POPCORN_ENDPOINT` or `http://localhost:4100` | Popcorn API base URL                                    |
| `apiKey`          | `POPCORN_API_KEY`                             | Project API key                                         |
| `project`         |                                               | Informational; the key decides the project              |
| `enabled`         | `true` unless `POPCORN_ENABLED=false`         | Turns recording off without removing instrumentation    |
| `sampleRate`      | `1`                                           | Fraction of runs exported; unsampled runs still execute |
| `batchSize`       | `100`                                         | Spans per request                                       |
| `flushIntervalMs` | `2000`                                        | Export interval                                         |
| `maxQueueSize`    | `10000`                                       | Buffered spans before the oldest are dropped            |
| `redact`          |                                               | `SpanRedactor` or array, run before export              |
| `debug`           | `false`                                       | Log exporter activity                                   |

```ts
popcorn.init({ project: 'support-bot', sampleRate: 0.1, redact: [popcorn.redactors.email] });
```

## popcorn.agent(name, fn)

Declares a replayable agent. Each call is recorded as a run named `name`, with the argument as the run input. `popcorn.rewind` and `popcorn review` find the function again by name.

```ts
export const triage = popcorn.agent('support-triage', async (ticket: Ticket) => {
  return { category: 'shipping' };
});
await triage(ticket);
```

## popcorn.trace(name, fn, options?)

Records `fn` as a run, or as a `step` span when called inside another run. Context follows `await`, timers and promise chains through `AsyncLocalStorage`.

| Option          | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `input`         | Recorded as the span input; for a root span, the run input |
| `attributes`    | Extra key/value pairs on the span                          |
| `captureOutput` | `false` to skip recording the return value                 |

`fn` receives the `Span`, which has `setAttribute(key, value)`, `setInput`, `setOutput` and `recordError`.

## popcorn.tool(name, fn, options?)

Wraps a tool. Returns a function with the same parameters that records a `tool` span. One argument is recorded as-is; several are recorded as an array. Outside a run the wrapper calls `fn` directly.

```ts
const getCustomer = popcorn.tool('get_customer', fetchCustomer, { cache: { ttlMs: 60_000 } });
```

`cache` keeps results in memory keyed by arguments, for tools that are deterministic over the TTL. Hits are marked on the span and the dashboard shows a hit rate per tool. Do not cache tools with side effects.

## popcorn.wrapAnthropic(client) / popcorn.wrapOpenAI(client)

Return an instrumented view of the client; the original object is not modified.

- Anthropic: `messages.create`, `messages.stream`, and their `beta` variants, streaming or not.
- OpenAI: `chat.completions.create` and `responses.create`, streaming or not. Streaming chat completions only report tokens when you pass `stream_options: { include_usage: true }`.

Neither SDK is a dependency of `@popcorn-ai/sdk`.

## popcorn.rewind(runId, options?)

Replays a recorded run. See the [Replay guide](replay.md).

| Option          | Default                                   | Description                                                     |
| --------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `fromStep`      | `0`                                       | Model calls before this step return their recorded response     |
| `overrides`     |                                           | `{ model?, system?, params?(params, provider) }` for live calls |
| `onFixtureMiss` | `'fail'`                                  | `'live'` calls the real tool when arguments were never recorded |
| `agent`         | the agent registered under the run's name | Function to re-run                                              |
| `input`         | the recorded input                        | Replace the input                                               |

Returns `{ runId, originalRunId, output, error, diff }`. A failing agent is returned as `error`, not thrown.

## popcorn.dataset.add(runId, options)

Saves a run as a test case. `options`: `dataset` (created if missing), `name`, `expected`, `checks`. See the [Eval guide](evals.md) for check types.

## popcorn.flush() / popcorn.shutdown()

`flush` sends everything buffered and resolves even if the API is unreachable. `shutdown` also stops the export timer. Call one before a short-lived process exits.

## popcorn.redactors

Span redactors for `init({ redact })`. Values under auth-like keys (`authorization`, `api_key`, `password`, `cookie`, ...) are always replaced with `[REDACTED]` first.

| Redactor                                | Effect                                             |
| --------------------------------------- | -------------------------------------------------- |
| `redactors.email`                       | Replaces email addresses with `[EMAIL]`            |
| `redactors.phone`                       | Replaces phone numbers of 9+ digits with `[PHONE]` |
| `redactors.pattern(regex, replacement)` | Custom global regex                                |
| `redactors.compose(...redactors)`       | Runs several in order                              |

A custom redactor is `(span) => span | null`; returning `null` drops the span. If a redactor throws, the span is dropped rather than exported unredacted.

## popcorn.onSpanEnd(listener)

Calls `listener` with every finished span, before redaction. Returns an unsubscribe function. The eval runner and `rewind` use it to read spans locally.

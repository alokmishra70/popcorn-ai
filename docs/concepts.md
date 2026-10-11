# Concepts

## Run

One execution of your agent, from input to final answer. A run has a status (`running`, `ok`, `error`), a duration, token counts, a cost and zero or more flags. Runs are what you search, replay and turn into test cases.

## Span

A timed unit of work inside a run. Spans form a tree through their parent id.

| Kind    | Created by                                | Records                                 |
| ------- | ----------------------------------------- | --------------------------------------- |
| `agent` | `popcorn.agent`, or the outermost `trace` | Run input and final output              |
| `llm`   | `wrapAnthropic`, `wrapOpenAI`             | Model, messages, response, tokens, cost |
| `tool`  | `popcorn.tool`                            | Arguments, result, errors, args hash    |
| `step`  | `popcorn.trace` called inside a run       | Whatever you pass in and return         |

Spans are exported when they end. The SDK batches them (100 spans or every 2 seconds) and never blocks or throws into your code; if the API is down, spans wait in memory up to 10,000 and the oldest are dropped with a warning.

## Step

Model and tool calls in start order. Step numbers are what `fromStep` refers to when replaying and what the `max_steps` check counts.

## Flags (Bloopers)

Set by the ingest worker after each batch:

| Flag         | Raised when                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `error`      | The run or any model call failed                                                                     |
| `loop`       | The same tool was called with the same arguments 3 or more times                                     |
| `cost_spike` | Run cost is above the project threshold (default $0.50)                                              |
| `max_steps`  | The run made at least the project's max steps (default 25), or the agent set `popcorn.max_steps_hit` |

Thresholds are per project, under **Settings**.

## Cost

Computed by the worker from a price table of USD per million tokens ([`models.json`](https://github.com/popcorn-ai/popcorn/blob/main/packages/core/src/pricing/models.json)). Cache reads and writes are priced separately. Models missing from the table are recorded with no cost rather than a guessed one.

## Fixture

A recorded tool result, keyed by tool name and a hash of the normalized arguments (object keys sorted, strings trimmed). Every tool span becomes a fixture. Replays read them instead of calling the tool.

## Dataset, test case, eval run

A **dataset** (suite) is a named list of **test cases**. Each case has an input, an optional expected outcome and a list of checks. An **eval run** is one execution of a whole suite; it stores a result per case and is compared with the latest eval run on your main branch. In the dashboard these are **Reviews**, scored as stars.

## Naming

The dashboard uses themed names; the SDK and API always use the plain terms.

| Dashboard      | Plain term                        |
| -------------- | --------------------------------- |
| Bloopers       | Failed and flagged runs           |
| Scene by Scene | Run timeline (span waterfall)     |
| Rewind         | Replay with recorded tool outputs |
| Reviews        | Eval results                      |
| Box Office     | Cost and usage overview           |
| Watch          | Live tail of incoming runs        |

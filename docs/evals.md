# Eval guide

An eval suite is a dataset of test cases. `popcorn review` runs every case through your real agent with tracing on, applies the checks to the recorded run, stores the result and compares it with the latest review on `main`.

## 1. Describe your agents

`popcorn.config.ts` in your project root:

```ts
import { defineConfig } from '@popcorn-ai/cli';
import { supportTriage } from './src/agent';

export default defineConfig({
  agents: { [supportTriage.agentName]: supportTriage },
  judge: { model: 'claude-haiku-5-5' },
  metadata: { model: 'claude-opus-5-5', prompt: 'v3' },
});
```

`metadata` is stored with every review so you can compare models and prompt versions.

## 2. Build a dataset

From a real run, in the dashboard (**Save as test case**) or in code:

```ts
await popcorn.dataset.add(runId, {
  dataset: 'support-v1',
  expected: { category: 'refund' },
  checks: [
    { type: 'output_equals', path: 'category', value: 'refund' },
    { type: 'tool_called', tool: 'lookup_order' },
    { type: 'max_cost', maxUsd: 0.05 },
  ],
});
```

Or by hand through the API, with `input` instead of `sourceRunId`:

```bash
curl -X POST $POPCORN_ENDPOINT/v1/datasets/support-v1/cases \
  -H "authorization: Bearer $POPCORN_API_KEY" -H 'content-type: application/json' \
  -d '{"agent":"support-triage","input":{"subject":"..."},"checks":[{"type":"max_steps","max":6}]}'
```

## Checks

| Type               | Fields                                    | Passes when                                      |
| ------------------ | ----------------------------------------- | ------------------------------------------------ |
| `tool_called`      | `tool`, `minTimes` = 1, `maxTimes`?       | The tool was called within the bounds            |
| `tool_not_called`  | `tool`                                    | The tool was never called                        |
| `tool_args_schema` | `tool`, `schema` (JSON Schema)            | Every call's arguments validate                  |
| `output_contains`  | `value`, `path`?, `caseSensitive` = false | The output (or field at `path`) contains `value` |
| `output_matches`   | `pattern`, `flags`?, `path`?              | The regex matches                                |
| `output_equals`    | `value`, `path`?                          | Deep equality                                    |
| `valid_json`       | `path`?                                   | The value is an object or parses as JSON         |
| `max_steps`        | `max`                                     | Model plus tool calls are at most `max`          |
| `max_cost`         | `maxUsd`                                  | The run cost at most `maxUsd`                    |
| `llm_judge`        | `rubric`, `model`?                        | The judge model says the output meets the rubric |

`path` is a dot path into the output, such as `triage.category`. Every check accepts an optional `name` for display.

Prefer deterministic checks; they are free, instant and never disagree with themselves. Use `llm_judge` for what only reading can decide, such as tone or whether a reply answers the question.

## LLM-as-judge

The judge sees the rubric, the case input, the expected outcome and the agent's output, and returns pass or fail with a reason through structured output. The judge model and a hash of the judge prompt are stored with every verdict. Identical judgements are cached in `node_modules/.cache/popcorn/judge.json`, so re-running an unchanged suite costs nothing for the judge.

Set `judge: { enabled: false }` to skip judge checks; they are then reported as skipped, not failed.

**Calibration.** On a review page, mark each judge verdict right or wrong. **Reviews** shows the agreement rate, so you know how far to trust the judge before relying on it in CI.

## 3. Run it

```bash
npx popcorn review --suite support-v1
```

This is the offline support agent after a prompt edit that drops the rule about damaged items:

```
Reviews are in: 33/40, down 4 from main. 4 new bloopers.  ★★★★☆

                this run        main            change
Passing         33/40 (82.5%)   37/40 (92.5%)   -4
Cost per case   $0.013          $0.013          -0.6%
p95 latency     1.46 s          1.46 s          0%

broken   T-002 Package arrived damaged  category: expected "refund", got "shipping"
broken   T-016 Missing part  category: expected "refund", got "shipping"
broken   T-021 Kettle stopped working  category: expected "refund", got "shipping"
broken   T-035 Glass lid shattered  category: expected "refund", got "shipping"
failing  T-012 Tracking says delivered but nothing here  at most 6 steps: 9 steps, limit is 6
```

| Flag            | Default      | Description                                                                |
| --------------- | ------------ | -------------------------------------------------------------------------- |
| `--concurrency` | `4`          | Cases run at once                                                          |
| `--repeat`      | `1`          | Run each case n times; cases whose attempts disagree are reported as flaky |
| `--baseline`    | `main`       | Branch whose latest review is the baseline                                 |
| `--format`      | `table`      | `table`, `markdown` or `json`                                              |
| `--output`      |              | Also write the report to a file (`.md` or `.json` picks the format)        |
| `--fail-on`     | `regression` | Exit 1 on `regression`, on `any` failing case, or `never`                  |
| `--no-upload`   |              | Do not store this review                                                   |
| `--label`       |              | Free-text label stored with the review                                     |

A **regression** is a case that passed on the baseline and fails now. With `--repeat`, a case passes only if every attempt passes.

## Comparing models

Run the same suite twice with different `SUPPORT_AGENT_MODEL` (or however your config picks the model), then pick both reviews under **Reviews → Compare** to see pass rate, cost per case and p95 latency side by side, and which cases changed.

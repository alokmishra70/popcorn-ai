# Replay guide

Rewind re-runs a recorded run with the tools stubbed to what they returned the first time. Model calls go live, so you can test a new prompt or model against a real failure without touching real APIs, databases or customers.

## How it works

1. Every tool span is stored as a fixture: tool name, a hash of the normalized arguments, and the result (or error).
2. `rewind` loads the run's input, spans and fixtures, then calls your agent with the same input.
3. Each tool call is looked up by name and argument hash. A hit returns the recorded result; a recorded error is thrown again.
4. Model calls before `fromStep` return their recorded responses. From `fromStep` on they call the model, with your overrides applied.
5. The replay is recorded as a new run linked to the original, and a step-by-step diff is returned.

## From the terminal

```bash
npx popcorn rewind 3f2a9c1e-... --system-file prompts/system-v2.md
npx popcorn rewind 3f2a9c1e-... --from-step 4 --model claude-sonnet-5-5
```

Run it in the directory that holds `popcorn.config.ts`, so your agent is registered. The dashboard's **Rewind** button builds this command for you.

## From code

```ts
const result = await popcorn.rewind(runId, {
  fromStep: 3,
  overrides: { system: newPrompt, model: 'claude-sonnet-5-5' },
});

console.log(result.diff.finalOutput.changed, result.diff.counts);
```

## The diff

Steps are aligned by kind and name, so an extra tool call in the replay shows up as one `added` step instead of shifting every row below it. Each step is `unchanged`, `changed` (with the fields that differ), `added` or `removed`. Totals compare steps, tokens, cost and duration. In the dashboard, open the original run and choose **Diff** next to a rewind.

## Fixture misses

If the new prompt makes the agent call a tool with arguments that were never recorded, there is nothing to return. By default the call throws `FixtureMissError` and the span is marked `fixture miss`, so a replay can never reach a real system by accident. Pass `onFixtureMiss: 'live'` (`--on-miss live`) to call the real tool instead.

Arguments are normalized before hashing: object keys are sorted and strings trimmed, so `{ "b": 1, "a": " x " }` and `{ "a": "x", "b": 1 }` match.

## Non-determinism

Model output varies between calls, so a replayed run rarely matches word for word. Compare outcomes, not text: the final answer, which tools were called, and the checks in your eval suite. Where the model supports it, a lower temperature (via `overrides.params`) reduces noise.

## Limits

- `messages.stream()` always calls the model live; recorded responses are served for `messages.create`, streaming or not.
- Replaying from the dashboard runs the CLI command shown in the Rewind dialog; the dashboard does not execute your agent's code.

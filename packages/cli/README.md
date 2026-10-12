# @popcornai/cli

Command line for [Popcorn AI](https://github.com/alokmishra70/popcorn-ai): run eval suites against your AI agent and catch regressions, replay recorded runs, and tail live runs.

```bash
npm install --save-dev @popcornai/cli
```

## Setup

Describe your agents in `popcorn.config.ts` at your project root:

```ts
import { defineConfig } from '@popcornai/cli';
import { supportAgent } from './src/agent';

export default defineConfig({
  agents: { [supportAgent.agentName]: supportAgent },
  judge: { model: 'claude-haiku-5-5' },
});
```

Set `POPCORN_ENDPOINT` and `POPCORN_API_KEY` (or put them in `.env`; the CLI loads it).

## popcorn review

Runs every test case in a suite through your real agent, applies the checks, stores the result and compares it with the latest run on `main`.

```bash
npx popcorn review --suite support-v1
```

```
Reviews are in: 33/40, down 4 from main. 4 new bloopers.  ★★★★☆

                this run        main            change
Passing         33/40 (82.5%)   37/40 (92.5%)   -4
Cost per case   $0.013          $0.013          -0.6%

broken   T-002 Package arrived damaged  category: expected "refund", got "shipping"
```

Exits 1 when a case that passed on the baseline now fails, so it works as a CI gate.

| Option                | Default    |                                              |
| --------------------- | ---------- | -------------------------------------------- |
| `--concurrency <n>`   | 4          | Cases run at once                            |
| `--repeat <n>`        | 1          | Run each case n times and report flaky cases |
| `--baseline <branch>` | main       | Branch to compare against                    |
| `--format`            | table      | `table`, `markdown` or `json`                |
| `--output <file>`     |            | Also write the report to a file              |
| `--fail-on`           | regression | `regression`, `any` or `never`               |
| `--no-upload`         |            | Don't store this run                         |

Checks include `tool_called`, `tool_args_schema`, `output_equals`, `output_matches`, `max_steps`, `max_cost` and `llm_judge`. See the [eval guide](https://github.com/alokmishra70/popcorn-ai/blob/main/docs/evals.md).

## popcorn rewind

Replays a recorded run with tools stubbed to their recorded outputs, then prints a step-by-step diff.

```bash
npx popcorn rewind <run-id> --system-file prompts/v2.md
npx popcorn rewind <run-id> --from-step 4 --model claude-sonnet-5-5
```

## popcorn watch

Live tail of incoming runs.

```bash
npx popcorn watch
```

## popcorn dataset add

```bash
npx popcorn dataset add <run-id> --suite support-v1 --checks '[{"type":"max_steps","max":6}]'
```

## GitHub Action

Post the review as a pull request comment on every push:

```yaml
- uses: alokmishra70/popcorn-ai/.github/actions/review@v1
  with:
    suite: support-v1
```

See the [CI guide](https://github.com/alokmishra70/popcorn-ai/blob/main/docs/ci.md). Requires Node 20.11 or newer. MIT licensed.

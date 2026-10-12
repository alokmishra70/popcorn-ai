# CI guide

The Popcorn GitHub Action runs a suite on every pull request and posts one comment that it updates on each push:

> **Reviews are in: 37/40, up 2 from main. 1 new blooper.**
>
> |               | This run      | main (a1b2c3d) | Change |
> | ------------- | ------------- | -------------- | ------ |
> | Passing       | 37/40 (92.5%) | 35/40 (87.5%)  | +2     |
> | Cost per case | $0.013        | $0.016         | -18.0% |

## Setup

1. Add `@popcornai/cli` to your project's dev dependencies and commit `popcorn.config.ts`.
2. Add repository secrets: `POPCORN_API_KEY` (a key from **Settings**, e.g. named `ci`) and whatever your agent needs (`ANTHROPIC_API_KEY`).
3. Add `.github/workflows/popcorn.yml`:

```yaml
name: Popcorn review
on:
  pull_request:
  push:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    env:
      POPCORN_ENDPOINT: https://popcorn.example.com
      POPCORN_API_KEY: ${{ secrets.POPCORN_API_KEY }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - uses: alokmishra70/popcorn-ai/.github/actions/review@v1
        with:
          suite: support-v1
```

Running on pushes to `main` matters: those reviews are the baselines pull requests are compared against.

## Inputs

| Input               | Default      | Description                                |
| ------------------- | ------------ | ------------------------------------------ |
| `suite`             | required     | Dataset to run                             |
| `config`            |              | Path to `popcorn.config.ts`                |
| `working-directory` | `.`          | Where the config and `@popcornai/cli` live |
| `baseline-branch`   | `main`       | Branch to compare against                  |
| `repeat`            | `1`          | Attempts per case, to catch flaky cases    |
| `fail-on`           | `regression` | `regression`, `any` or `never`             |
| `comment`           | `true`       | Post or update the PR comment              |

The report is also written to the job summary. Outputs: `exit-code` and `report` (path to the markdown).

## Cost control

Every review calls your agent's model once per case and attempt, plus the judge for `llm_judge` checks. Keep CI suites small (20 to 50 cases), use a cheaper judge model, and rely on the judge cache: unchanged outputs are not judged twice.

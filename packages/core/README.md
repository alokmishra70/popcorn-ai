# @popcornai/core

Shared building blocks for [Popcorn AI](https://github.com/alokmishra70/popcorn-ai), used by the SDK, CLI, API and dashboard. It has no I/O and no runtime dependencies besides `zod` and `ajv`.

You normally don't install this directly: use [`@popcornai/sdk`](https://www.npmjs.com/package/@popcornai/sdk) to trace agents and [`@popcornai/cli`](https://www.npmjs.com/package/@popcornai/cli) to run evals.

What's inside:

- **Span schema**: the wire format the SDK sends (`spanSchema`, `spanBatchSchema`)
- **Pricing**: `computeCost(model, usage)` from a table of USD per million tokens, cache tokens priced separately
- **Flags**: `detectFlags(spans)` for errors, loops, cost spikes and step limits
- **Traces**: `buildSpanTree`, `listSteps`, `sumUsage`
- **Diffs**: `diffRuns(original, replay)`, step-aligned
- **Evals**: `checkSchema`, `runChecks`, `compareEvalRuns`, `collapseAttempts`
- **Node helpers** (`@popcornai/core/node`): `hashArgs(toolName, args)` for replay fixtures

MIT licensed.

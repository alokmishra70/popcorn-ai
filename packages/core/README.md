<p align="center">
  <img src="https://raw.githubusercontent.com/alokmishra70/popcorn-ai/main/.github/assets/logo.png" width="96" height="96" alt="Popcorn AI logo">
</p>

<h1 align="center">@popcornai/core</h1>

<p align="center"><b>Grab the popcorn. Watch what your agent really did.</b></p>

<p align="center">Shared building blocks for Popcorn AI: span schema, pricing, flags, diffs and eval checks.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@popcornai/core"><img src="https://img.shields.io/npm/v/@popcornai/core?color=d42a2f&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@popcornai/core"><img src="https://img.shields.io/npm/dw/@popcornai/core?color=d42a2f" alt="weekly downloads"></a>
  <a href="https://github.com/alokmishra70/popcorn-ai/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-1c1917" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-2563a8" alt="TypeScript strict">
  <a href="https://github.com/alokmishra70/popcorn-ai"><img src="https://img.shields.io/github/stars/alokmishra70/popcorn-ai?style=flat&color=1c1917" alt="GitHub stars"></a>
</p>

<p align="center"><a href="https://github.com/alokmishra70/popcorn-ai/blob/main/docs/quickstart.md">Quickstart</a> · <a href="https://github.com/alokmishra70/popcorn-ai/tree/main/docs">Docs</a> · <a href="https://github.com/alokmishra70/popcorn-ai/tree/main/examples/support-agent">Example agent</a> · <a href="https://github.com/alokmishra70/popcorn-ai">GitHub</a></p>

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

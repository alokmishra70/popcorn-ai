# Support triage agent

The dogfood agent for Popcorn. It reads a support ticket for an online kitchenware store, looks up the order and customer, searches the help center, and returns a category, a priority and a reply. Its traces and reviews are the demo data and the source of the project's metrics.

- `src/agent.ts`: a manual tool-use loop on Claude (`claude-opus-5-5` by default) through the wrapped Anthropic client. It finishes through a strict `submit_triage` tool, and uses server-side refusal fallbacks (`fallbacks: "default"`).
- `src/tools.ts`: three tools wrapped with `popcorn.tool`; `get_customer` uses the result cache.
- `src/offline-model.ts`: a deterministic stand-in for Claude with the same request shape, for running without an API key. It follows the system prompt's rule about damaged items, so editing the prompt changes its behaviour. Token counts are estimated and costs in offline runs are simulated.
- `data/tickets.json`: 40 synthetic tickets with expected category and priority.
- `prompts/`: `system-v1.md` is the current prompt; `system-v2.md` drops one rule and is used to show a regression.

## Run it

From the repo root, with the API running and `POPCORN_API_KEY` in `.env`:

```bash
cd examples/support-agent
SUPPORT_AGENT_OFFLINE=true pnpm tickets 10      # 10 traced runs; drop the variable to use Claude
pnpm suite                                       # create the support-v1 suite (40 cases)
SUPPORT_AGENT_OFFLINE=true GITHUB_REF_NAME=main pnpm review    # baseline on main
SUPPORT_AGENT_OFFLINE=true SUPPORT_AGENT_PROMPT=system-v2 pnpm review   # 4 new bloopers
```

Rewind a flagged run with the new prompt:

```bash
npx popcorn rewind <run-id> --system-file prompts/system-v2.md
```

Live runs need Anthropic credentials (`ANTHROPIC_API_KEY` or an `ant auth login` profile). `SUPPORT_AGENT_MODEL` picks the model.

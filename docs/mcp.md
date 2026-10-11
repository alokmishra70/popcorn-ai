# MCP server

`@popcorn-ai/mcp` lets Claude, or any MCP client, debug your agent from its traces.

```bash
claude mcp add popcorn \
  --env POPCORN_ENDPOINT=http://localhost:4100 \
  --env POPCORN_API_KEY=pk_... \
  -- npx @popcorn-ai/mcp
```

| Tool          | Description                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `search_runs` | Find runs by text, status, flag or agent name; one line per run                 |
| `get_run`     | A run step by step: each model and tool call with arguments, results and errors |
| `run_eval`    | Run a suite against the agent in `popcorn.config.ts` and return the review      |

Payloads in `get_run` are clipped to 1,500 characters each so a long run fits in context. `run_eval` calls your real model and costs money; MCP clients show it as a non-read-only tool.

Try: _"Find the support-triage runs flagged as loops this week and tell me what the agent kept retrying."_

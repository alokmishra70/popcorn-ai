# @popcornai/mcp

An [MCP](https://modelcontextprotocol.io) server for [Popcorn AI](https://github.com/alokmishra70/popcorn-ai). It lets Claude, or any MCP client, search your AI agent's runs, read a trace step by step, and run an eval suite.

## Add to Claude Code

```bash
claude mcp add popcorn \
  --env POPCORN_ENDPOINT=http://localhost:4100 \
  --env POPCORN_API_KEY=pk_... \
  -- npx -y @popcornai/mcp
```

Other clients: run `npx -y @popcornai/mcp` as a stdio server with the same two environment variables.

## Tools

| Tool          | What it does                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `search_runs` | Find runs by text, status, flag (error, loop, cost_spike, max_steps) or agent name                |
| `get_run`     | A run step by step: each model and tool call with arguments, results and errors                   |
| `run_eval`    | Run a suite against the agent in `popcorn.config.ts` and return the review. Calls your real model |

Payloads are clipped to 1,500 characters each so long runs fit in context.

Try: _"Find the runs flagged as loops this week and tell me what the agent kept retrying."_

Requires Node 20.11 or newer and a running Popcorn server. MIT licensed.

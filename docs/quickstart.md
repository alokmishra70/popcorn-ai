# Quickstart

Ten minutes from install to your first trace. You need Node 20 or newer and either Docker or a local Postgres.

## 1. Start Popcorn

```bash
git clone https://github.com/popcorn-ai/popcorn && cd popcorn
docker compose up
```

This starts Postgres, Redis, the ingest API on port 4100, a worker and the dashboard on [localhost:3000](http://localhost:3000). It also creates a project called `support-bot` with the API key `pk_local_change_me_0000000000`. Set `POPCORN_API_KEY` before `docker compose up` to choose your own.

Without Docker, see [Self-hosting](self-hosting.md#without-docker).

## 2. Install the SDK

```bash
npm install @popcorn-ai/sdk
```

```bash
export POPCORN_ENDPOINT=http://localhost:4100
export POPCORN_API_KEY=pk_local_change_me_0000000000
```

## 3. Wrap your client, tools and agent

```ts
import Anthropic from '@anthropic-ai/sdk';
import { popcorn } from '@popcorn-ai/sdk';

const anthropic = popcorn.wrapAnthropic(new Anthropic());

const lookupOrder = popcorn.tool('lookup_order', async ({ orderId }: { orderId: string }) => {
  return db.orders.find(orderId);
});

export const supportAgent = popcorn.agent('support-agent', async (ticket: Ticket) => {
  // Your agent loop, unchanged: every model call and tool call is recorded.
});

await supportAgent(ticket);
```

`popcorn.agent` records each call as one run with its input, so the run can be replayed and saved as a test case later. If you only need tracing, `popcorn.trace(name, fn)` works on any function.

Short-lived processes (scripts, serverless handlers) should `await popcorn.flush()` before exiting.

## 4. Open the dashboard

Go to **Runs**. Each run shows a timeline of model and tool calls (**Scene by Scene**), the message thread (**Conversation**), tokens, cost and latency. Failed runs, loops and cost spikes collect under **Bloopers**.

## Next

- [Concepts](concepts.md): runs, spans, steps and flags
- [Replay guide](replay.md): test a fix against a recorded failure
- [Eval guide](evals.md): turn runs into a regression suite
- [CI guide](ci.md): a pass/fail comment on every pull request

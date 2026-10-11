/**
 * Sends a steady trickle of tickets through the agent, like production traffic,
 * so the hosted demo's Box Office and Watch views have real data over time.
 *
 *   pnpm exec tsx scripts/simulate-traffic.ts [runs-per-minute]
 *
 * Runs until stopped. With SUPPORT_AGENT_OFFLINE=true it costs nothing.
 */
import { popcorn } from '@popcorn-ai/sdk';
import { loadTickets, supportTriage } from '../src/index';

const perMinute = Number(process.argv[2] ?? 6);
const tickets = loadTickets();
let stopping = false;

popcorn.init({ project: 'support-bot' });
process.once('SIGINT', () => {
  stopping = true;
});

console.log(`sending ~${perMinute} run(s) per minute; ctrl-c to stop`);
while (!stopping) {
  const { expected: _expected, ...ticket } = tickets[Math.floor(Math.random() * tickets.length)]!;
  await supportTriage(ticket).catch((error: unknown) => {
    console.log(`${ticket.id} failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  // Exponential gaps give bursty, realistic arrival times around the target rate.
  const waitMs = (-Math.log(1 - Math.random()) * 60_000) / perMinute;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
await popcorn.shutdown();

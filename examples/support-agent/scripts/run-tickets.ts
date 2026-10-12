/**
 * Runs tickets through the triage agent, one traced run each.
 *
 *   pnpm tickets            all 40 tickets
 *   pnpm tickets 5          the first 5
 *   SUPPORT_AGENT_OFFLINE=true pnpm tickets
 */
import { popcorn } from '@popcornai/sdk';
import { loadTickets, model, offline, supportTriage } from '../src/index';

const limit = Number(process.argv[2] ?? Infinity);
const tickets = loadTickets().slice(0, limit);

popcorn.init({ project: 'support-bot' });
console.log(`triaging ${tickets.length} ticket(s) with ${offline ? 'the offline model' : model}\n`);

let correct = 0;
for (const { expected, ...ticket } of tickets) {
  try {
    const result = await supportTriage(ticket);
    const ok = result.category === expected.category;
    if (ok) correct++;
    console.log(
      `${ticket.id}  ${ok ? 'ok  ' : 'MISS'}  ${result.category.padEnd(8)} ${result.priority.padEnd(7)} ${ticket.subject}`,
    );
  } catch (error) {
    console.log(`${ticket.id}  FAIL  ${error instanceof Error ? error.message : String(error)}`);
  }
}

await popcorn.shutdown();
console.log(`\ncategory accuracy ${correct}/${tickets.length}`);

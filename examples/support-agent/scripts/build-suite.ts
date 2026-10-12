/**
 * Creates the support-v1 eval suite from data/tickets.json. Every case checks
 * the category, a sane step count and cost, the order lookup when an order is
 * mentioned, and (with a judge available) the tone of the reply.
 *
 *   pnpm suite
 */
import { ApiClient } from '@popcornai/cli';
import type { CheckInput } from '@popcornai/sdk';
import { AGENT_NAME, loadTickets } from '../src/index';

const SUITE = 'support-v1';
const ORDER_ID = /\bA-\d{4}\b/;

const api = new ApiClient();
const existing = await api.find<{ cases: Array<{ name: string }> }>(`/v1/datasets/${SUITE}`);
const existingNames = new Set(existing?.cases.map((c) => c.name));

let added = 0;
for (const { expected, ...ticket } of loadTickets()) {
  const name = `${ticket.id} ${ticket.subject}`;
  if (existingNames.has(name)) continue;

  const checks: CheckInput[] = [
    { type: 'output_equals', name: 'category', path: 'category', value: expected.category },
    { type: 'output_equals', name: 'priority', path: 'priority', value: expected.priority },
    { type: 'max_steps', max: 6 },
    { type: 'max_cost', maxUsd: 0.05 },
    {
      type: 'llm_judge',
      name: 'reply quality',
      rubric:
        "The reply is two to four sentences, polite, addresses the customer's actual problem, and does not promise a refund amount or delivery date that is not supported by the ticket or tool results.",
    },
  ];
  const orderId = ticket.body.match(ORDER_ID)?.[0];
  if (orderId) {
    checks.push(
      { type: 'tool_called', tool: 'lookup_order' },
      { type: 'output_equals', name: 'order id', path: 'orderId', value: orderId },
    );
  }

  await api.post(`/v1/datasets/${SUITE}/cases`, {
    name,
    agent: AGENT_NAME,
    input: ticket,
    expected,
    checks,
  });
  added++;
}

console.log(`added ${added} case(s) to ${SUITE}`);

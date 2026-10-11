import { popcorn } from '@popcorn-ai/sdk';
import { findCustomer, findOrder, searchHelpCenter } from './store';

export const lookupOrder = popcorn.tool('lookup_order', async ({ orderId }: { orderId: string }) =>
  findOrder(orderId),
);

export const getCustomer = popcorn.tool(
  'get_customer',
  async ({ email }: { email: string }) => findCustomer(email),
  {
    cache: { ttlMs: 5 * 60_000 },
  },
);

export const searchHelp = popcorn.tool(
  'search_help_center',
  async ({ query }: { query: string }) => ({
    articles: searchHelpCenter(query),
  }),
);

export const CATEGORIES = ['shipping', 'refund', 'billing', 'account', 'product', 'other'] as const;
export const PRIORITIES = ['urgent', 'high', 'normal'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** Tool definitions sent to the model. `submit_triage` ends the run. */
export const toolDefinitions = [
  {
    name: 'lookup_order',
    description:
      'Fetch an order by its id (format A-1234): items, status, expected delivery and days late.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: { orderId: { type: 'string', description: 'Order id, e.g. A-1001' } },
      required: ['orderId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_customer',
    description:
      "Fetch a customer's tier (standard or gold), order count and open tickets by email.",
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: { email: { type: 'string' } },
      required: ['email'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_help_center',
    description:
      'Search help center articles about products, shipping regions, returns and warranty.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_triage',
    description: 'Submit the final triage decision and the reply to send. Call exactly once, last.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', enum: [...CATEGORIES] },
        priority: { type: 'string', enum: [...PRIORITIES] },
        orderId: { type: ['string', 'null'], description: 'The order the ticket is about, if any' },
        reply: { type: 'string', description: 'Reply to the customer, two to four sentences' },
      },
      required: ['category', 'priority', 'orderId', 'reply'],
      additionalProperties: false,
    },
  },
];

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export const toolHandlers: Record<string, ToolHandler> = {
  lookup_order: (input) => lookupOrder({ orderId: String(input.orderId) }),
  get_customer: (input) => getCustomer({ email: String(input.email) }),
  search_help_center: (input) => searchHelp({ query: String(input.query) }),
};

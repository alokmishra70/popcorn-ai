/** In-memory stand-in for the store's order and customer APIs. Deterministic so evals are repeatable. */

export type OrderStatus =
  'processing' | 'shipped' | 'in_transit' | 'delivered' | 'returned_to_sender' | 'refunded';

export interface Order {
  orderId: string;
  customerEmail: string;
  items: string[];
  totalUsd: number;
  status: OrderStatus;
  placedOn: string;
  expectedDelivery: string;
  daysLate: number;
}

export interface Customer {
  email: string;
  name: string;
  tier: 'standard' | 'gold';
  orders: number;
  openTickets: number;
}

const orders: Order[] = [
  ['A-1001', 'maya.patel@example.com', ['Duo electric kettle'], 79, 'in_transit', 2],
  ['A-1002', 'liam.chen@example.com', ['Cast iron skillet 28cm'], 64, 'delivered', 0],
  ['A-1003', 'sofia.rossi@example.com', ['Pour-over set'], 89, 'shipped', 0],
  ['A-1004', 'oliver.brown@example.com', ['Cast iron skillet 28cm'], 64, 'delivered', 0],
  ['A-1005', 'ava.garcia@example.com', ['Stand mixer'], 349, 'in_transit', 8],
  ['A-1006', 'mia.wilson@example.com', ['Knife block set'], 129, 'delivered', 0],
  ['A-1007', 'ethan.moore@example.com', ['Knife block set'], 129, 'delivered', 0],
  ['A-1008', 'isabella.taylor@example.com', ['Enamel dutch oven'], 159, 'delivered', 0],
  ['A-1009', 'amelia.white@example.com', ['Pour-over set'], 89, 'delivered', 0],
  ['A-1010', 'henry.harris@example.com', ['Saute pan'], 95, 'processing', 0],
  ['A-1011', 'alexander.lewis@example.com', ['Glass storage set'], 39, 'refunded', 0],
  ['A-1012', 'daniel.hall@example.com', ['Duo electric kettle'], 79, 'delivered', 0],
  ['A-1013', 'abigail.young@example.com', ['Stand mixer'], 349, 'processing', 6],
  ['A-1014', 'emily.king@example.com', ['Salt grinder'], 24, 'processing', 0],
  ['A-1015', 'victoria.baker@example.com', ['Duo electric kettle (sage)'], 79, 'delivered', 0],
  ['A-1016', 'jack.adams@example.com', ['Enamel dutch oven'], 159, 'returned_to_sender', 0],
  ['A-1017', 'chloe.mitchell@example.com', ['Saute pan'], 95, 'shipped', 0],
  ['A-1018', 'matthew.perez@example.com', ['Knife block set'], 129, 'in_transit', 3],
  ['A-1019', 'david.turner@example.com', ['Stock pot with glass lid'], 72, 'delivered', 0],
  ['A-1020', 'joseph.campbell@example.com', ['Cast iron skillet 20cm'], 49, 'refunded', 0],
  ['A-1021', 'hannah.parker@example.com', ['Pour-over set'], 89, 'processing', 0],
  ['A-1022', 'maya.patel@example.com', ['Enamel dutch oven'], 159, 'in_transit', 10],
].map(([orderId, customerEmail, items, totalUsd, status, daysLate]) => ({
  orderId: orderId as string,
  customerEmail: customerEmail as string,
  items: items as string[],
  totalUsd: totalUsd as number,
  status: status as OrderStatus,
  placedOn: '2026-09-28',
  expectedDelivery: '2026-10-03',
  daysLate: daysLate as number,
}));

const goldCustomers = new Set([
  'maya.patel@example.com',
  'isabella.taylor@example.com',
  'sofia.rossi@example.com',
]);

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

export function findOrder(orderId: string): Order {
  const order = orders.find((o) => o.orderId === orderId.trim().toUpperCase());
  if (!order) throw new NotFoundError(`No order with id ${orderId}`);
  return order;
}

export function findCustomer(email: string): Customer {
  const normalized = email.trim().toLowerCase();
  const own = orders.filter((o) => o.customerEmail === normalized);
  return {
    email: normalized,
    name: normalized
      .split('@')[0]!
      .split('.')
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join(' '),
    tier: goldCustomers.has(normalized) ? 'gold' : 'standard',
    orders: own.length,
    openTickets: own.filter((o) => o.daysLate > 0).length,
  };
}

const articles = [
  {
    id: 'KB-12',
    title: 'Induction compatibility',
    body: 'All Duo kettles and every cast iron and stainless pan work on induction. Enamel dutch ovens do too. Glass and ceramic items do not.',
  },
  {
    id: 'KB-18',
    title: 'Seasoning cast iron',
    body: 'Wash, dry fully, wipe a thin layer of neutral oil over every surface, and bake upside down at 230°C for one hour. Repeat three times.',
  },
  {
    id: 'KB-21',
    title: 'Dishwasher and oven safety',
    body: 'Enamel dutch ovens and stainless pans are oven safe to 260°C. Hand wash cast iron and enamel. Stainless pans are dishwasher safe.',
  },
  {
    id: 'KB-30',
    title: 'Returns and refunds',
    body: 'Unused items can be returned within 30 days. Damaged or wrong items are replaced or refunded in full; refunds reach the card in 5-10 business days.',
  },
  {
    id: 'KB-34',
    title: 'International shipping',
    body: 'We ship to Canada, the UK and the EU. Delivery to Canada takes 6-9 business days.',
  },
  {
    id: 'KB-41',
    title: 'Warranty',
    body: 'Electric appliances carry a 2 year warranty. Stand mixers carry 5 years on the motor.',
  },
  {
    id: 'KB-47',
    title: 'Gift wrapping and order changes',
    body: 'Gift wrapping and address changes are possible until an order ships. Contact support with the order number.',
  },
];

export function searchHelpCenter(query: string) {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  return articles
    .map((a) => ({
      ...a,
      score: terms.filter((t) => `${a.title} ${a.body}`.toLowerCase().includes(t)).length,
    }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ score: _score, ...a }) => a);
}

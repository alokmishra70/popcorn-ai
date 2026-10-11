import type Anthropic from '@anthropic-ai/sdk';
import type { MessagesClient } from './agent';
import type { Category, Priority } from './tools';

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.BetaMessage;
type ContentBlock = Anthropic.Beta.BetaContentBlock;

/*
 * A deterministic stand-in for Claude, so the demo, the eval suite and CI run
 * without an API key. It follows the same tool protocol as the real model and
 * reads the system prompt for the one rule that is easy to get wrong (whether
 * damaged items are refunds), so editing the prompt changes its behaviour the
 * way it would for a real model. Token counts are estimated from text length;
 * costs in offline runs are simulated, not billed.
 */

const ORDER_ID = /\bA-\d{4}\b/;

const KEYWORDS: Array<[Category, RegExp]> = [
  ['billing', /\b(charged|charge|invoice|payment|card|subscription|vat)\b/i],
  [
    'refund',
    /\b(return|refund|damaged|cracked|shattered|wrong|missing|cancel|stopped working|received cream)\b/i,
  ],
  [
    'account',
    /\b(log ?in|password|locked|two-factor|authenticator|delete my account|email on my account)\b/i,
  ],
  [
    'shipping',
    /\b(tracking|delivery|deliver|late|arrive|arrived|shipped|delivered|address|processing|courier|express|returned to sender)\b/i,
  ],
  ['product', /\b(dishwasher|induction|season|oven safe|warranty|ship to|deliver to)\b/i],
];

const DAMAGE = /\b(damaged|cracked|shattered|stopped working|missing)\b/i;

interface Observations {
  order?: { orderId: string; status: string; daysLate: number };
  customer?: { tier: string; name: string };
  articles?: Array<{ title: string; body: string }>;
  lookups: number;
}

export interface OfflineModelOptions {
  /** Simulated latency per call, in ms. */
  latencyMs?: number;
}

export class OfflineModel implements MessagesClient {
  constructor(private readonly options: OfflineModelOptions = {}) {}

  beta = {
    messages: {
      create: (params: CreateParams) => this.respond(params),
    },
  };

  private async respond(params: CreateParams): Promise<Message> {
    const ticket = firstUserText(params.messages);
    const seen = observations(params.messages);
    const system = typeof params.system === 'string' ? params.system : '';
    const content = this.decide(ticket, seen, system, params.model);

    await sleep(this.options.latencyMs ?? 120 + (hash(ticket + seen.lookups) % 400));

    const inputTokens = Math.ceil(
      (system.length + JSON.stringify(params.messages).length + 2400) / 4,
    );
    const outputTokens = Math.ceil(JSON.stringify(content).length / 4) + 30;
    return {
      id: `msg_offline_${hash(ticket + seen.lookups).toString(16)}`,
      type: 'message',
      role: 'assistant',
      model: params.model,
      content,
      stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    } as unknown as Message;
  }

  private decide(
    ticket: string,
    seen: Observations,
    system: string,
    model: string,
  ): ContentBlock[] {
    const orderId = ticket.match(ORDER_ID)?.[0] ?? null;
    const email = ticket.match(/From: (\S+)/)?.[1] ?? '';
    const category = classify(ticket, system, model);

    // A known quirk kept on purpose: "delivered but not here" makes it re-check the order, which shows up as a loop flag.
    const rechecks = /shows delivered/i.test(ticket) ? 3 : 1;
    if (orderId && seen.lookups < rechecks) return [toolUse('lookup_order', { orderId })];
    if (orderId && !seen.customer && email) return [toolUse('get_customer', { email })];
    if (category === 'product' && !seen.articles) {
      return [
        toolUse('search_help_center', {
          query: ticket
            .split('\n')
            .find((l) => l.startsWith('Subject:'))!
            .slice(9),
        }),
      ];
    }

    const priority = prioritize(ticket, seen);
    return [
      toolUse('submit_triage', {
        category,
        priority,
        orderId,
        reply: draftReply(seen, orderId, category),
      }),
    ];
  }
}

function classify(ticket: string, system: string, model: string): Category {
  const text = ticket.split('\n').slice(2).join(' ');
  const refundsIncludeDamage = /including damaged or wrong items/i.test(system);
  if (DAMAGE.test(text)) return refundsIncludeDamage ? 'refund' : 'shipping';

  // Smaller models settle on the first keyword they see; larger ones weigh the whole ticket.
  const matches = KEYWORDS.filter(([, pattern]) => pattern.test(text)).map(
    ([category]) => category,
  );
  if (matches.length === 0) return 'other';
  if (/haiku/.test(model)) return matches[0]!;
  if (
    matches.includes('product') &&
    /\b(how|does|is|can|do you)\b/i.test(text) &&
    !ORDER_ID.test(text)
  )
    return 'product';
  return matches[0]!;
}

function prioritize(ticket: string, seen: Observations): Priority {
  if (
    /\b(two charges|charged twice|double charged|twice)\b/i.test(ticket) &&
    /charge/i.test(ticket)
  )
    return 'urgent';
  if (seen.customer?.tier === 'gold' && seen.order && seen.order.status !== 'refunded')
    return 'urgent';
  if (DAMAGE.test(ticket) || /\bwrong\b/i.test(ticket) || (seen.order?.daysLate ?? 0) > 5)
    return 'high';
  return 'normal';
}

function draftReply(seen: Observations, orderId: string | null, category: Category): string {
  const name = seen.customer?.name.split(' ')[0] ?? 'there';
  if (seen.order && orderId) {
    const status = seen.order.status.replace(/_/g, ' ');
    const late = seen.order.daysLate > 0 ? `, ${seen.order.daysLate} days later than planned` : '';
    return `Hi ${name}, thanks for getting in touch about order ${orderId}. It is currently ${status}${late}. We've logged this as a ${category} request and the team will follow up within one business day.`;
  }
  if (seen.articles?.[0]) {
    return `Hi ${name}, good question. ${seen.articles[0].body} Let us know if there's anything else we can help with.`;
  }
  return `Hi ${name}, thanks for reaching out. We've passed your message to the ${category} team and they will reply within one business day.`;
}

function firstUserText(messages: CreateParams['messages']): string {
  const first = messages[0]?.content;
  return typeof first === 'string' ? first : '';
}

function observations(messages: CreateParams['messages']): Observations {
  const seen: Observations = { lookups: 0 };
  const toolNames = new Map<string, string>();
  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const block of message.content) {
      if (block.type === 'tool_use') toolNames.set(block.id, block.name);
      if (block.type !== 'tool_result' || block.is_error) continue;
      const name = toolNames.get(block.tool_use_id);
      const parsed = JSON.parse(typeof block.content === 'string' ? block.content : '{}') as Record<
        string,
        unknown
      >;
      if (name === 'lookup_order') {
        seen.lookups += 1;
        seen.order = parsed as unknown as Observations['order'];
      }
      if (name === 'get_customer') seen.customer = parsed as unknown as Observations['customer'];
      if (name === 'search_help_center')
        seen.articles = (parsed.articles as Observations['articles']) ?? [];
    }
  }
  return seen;
}

// Ids derive from the call itself so a replayed run produces identical messages.
function toolUse(name: string, input: Record<string, unknown>): ContentBlock {
  const id = `toolu_offline_${hash(name + JSON.stringify(input)).toString(16)}`;
  return { type: 'tool_use', id, name, input } as ContentBlock;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

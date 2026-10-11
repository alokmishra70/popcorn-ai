import type Anthropic from '@anthropic-ai/sdk';
import { popcorn, SpanAttr } from '@popcorn-ai/sdk';
import { toolDefinitions, toolHandlers, type Category, type Priority } from './tools';

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  customerEmail: string;
}

export interface Triage {
  category: Category;
  priority: Priority;
  orderId: string | null;
  reply: string;
}

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.BetaMessage;

/** The slice of the Anthropic client the agent uses; the offline model implements the same shape. */
export interface MessagesClient {
  beta: { messages: { create(params: CreateParams): Promise<Message> } };
}

export interface TriageAgentOptions {
  client: MessagesClient;
  model: string;
  systemPrompt: string;
  /** Model turns before the run is abandoned. */
  maxTurns?: number;
}

export class TriageError extends Error {
  override readonly name = 'TriageError';
}

const formatTicket = (ticket: Ticket) =>
  `Ticket ${ticket.id}\nFrom: ${ticket.customerEmail}\nSubject: ${ticket.subject}\n\n${ticket.body}`;

/**
 * A manual tool-use loop: the model reads the ticket, calls lookup tools, and
 * finishes by calling `submit_triage`. Every model call and tool call is traced
 * through the wrapped client and `popcorn.tool`.
 */
export function createTriageAgent({
  client,
  model,
  systemPrompt,
  maxTurns = 6,
}: TriageAgentOptions) {
  const anthropic = popcorn.wrapAnthropic(client);

  return async function triage(ticket: Ticket): Promise<Triage> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: formatTicket(ticket) },
    ];

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await anthropic.beta.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: toolDefinitions,
        messages,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as CreateParams);

      if (response.stop_reason === 'refusal') {
        throw new TriageError('model declined the ticket; route it to a human');
      }
      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter((block) => block.type === 'tool_use');
      const submission = toolUses.find((block) => block.name === 'submit_triage');
      if (submission) return submission.input as Triage;
      if (toolUses.length === 0)
        throw new TriageError(`model stopped (${response.stop_reason}) without submitting`);

      const results = await Promise.all(
        toolUses.map(async (block): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const handler = toolHandlers[block.name];
          try {
            if (!handler) throw new Error(`unknown tool ${block.name}`);
            const output = await handler(block.input as Record<string, unknown>);
            return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { type: 'tool_result', tool_use_id: block.id, content: message, is_error: true };
          }
        }),
      );
      messages.push({ role: 'user', content: results });
    }

    popcorn.currentSpan()?.setAttribute(SpanAttr.MaxStepsHit, true);
    throw new TriageError(`no decision after ${maxTurns} turns`);
  };
}

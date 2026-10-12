import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { popcorn } from '@popcornai/sdk';
import { createTriageAgent, type MessagesClient, type Ticket, type Triage } from './agent';
import { OfflineModel } from './offline-model';

export type { Ticket, Triage } from './agent';

export const AGENT_NAME = 'support-triage';

/** Claude Opus 5.5 unless SUPPORT_AGENT_MODEL says otherwise. */
export const model = process.env.SUPPORT_AGENT_MODEL ?? 'claude-opus-5-5';

/** SUPPORT_AGENT_OFFLINE=true swaps Claude for a deterministic local model. */
export const offline = process.env.SUPPORT_AGENT_OFFLINE === 'true';

export function loadPrompt(version = process.env.SUPPORT_AGENT_PROMPT ?? 'system-v1'): string {
  return readFileSync(new URL(`../prompts/${version}.md`, import.meta.url), 'utf8');
}

const client: MessagesClient = offline
  ? new OfflineModel()
  : (new Anthropic() as unknown as MessagesClient);

export const systemPrompt = loadPrompt();

export const supportTriage = popcorn.agent<Ticket, Triage>(
  AGENT_NAME,
  createTriageAgent({ client, model, systemPrompt }),
);

export function loadTickets(): Array<Ticket & { expected: Pick<Triage, 'category' | 'priority'> }> {
  return JSON.parse(readFileSync(new URL('../data/tickets.json', import.meta.url), 'utf8'));
}

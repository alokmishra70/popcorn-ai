import type { StoredSpan } from '@popcornai/core';
import { describe, expect, it } from 'vitest';
import { buildConversation } from './conversation';

const span = (overrides: Partial<StoredSpan>): StoredSpan => ({
  id: crypto.randomUUID(),
  runId: 'r',
  parentId: 'root',
  kind: 'llm',
  name: 'llm',
  status: 'ok',
  startTime: 1,
  endTime: 2,
  ...overrides,
});

describe('buildConversation', () => {
  it('renders an Anthropic thread with tool calls and results', () => {
    const items = buildConversation([
      span({
        provider: 'anthropic',
        input: {
          system: 'You triage tickets.',
          messages: [
            { role: 'user', content: 'Where is A-1001?' },
            {
              role: 'assistant',
              content: [
                { type: 'tool_use', id: 't1', name: 'lookup_order', input: { orderId: 'A-1001' } },
              ],
            },
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: 't1', content: '{"status":"shipped"}' },
              ],
            },
          ],
        },
        output: { content: [{ type: 'text', text: 'It has shipped.' }] },
      }),
    ]);

    expect(items).toEqual([
      { kind: 'system', text: 'You triage tickets.' },
      { kind: 'message', role: 'user', text: 'Where is A-1001?' },
      { kind: 'tool_call', id: 't1', name: 'lookup_order', input: { orderId: 'A-1001' } },
      {
        kind: 'tool_result',
        id: 't1',
        name: 'lookup_order',
        output: { status: 'shipped' },
        isError: false,
      },
      { kind: 'message', role: 'assistant', text: 'It has shipped.' },
    ]);
  });

  it('renders an OpenAI chat thread', () => {
    const items = buildConversation([
      span({
        provider: 'openai',
        input: {
          messages: [
            { role: 'system', content: 'Be brief.' },
            { role: 'user', content: 'hi' },
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'c1', type: 'function', function: { name: 'lookup', arguments: '{"id":1}' } },
              ],
            },
            { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
          ],
        },
        output: { choices: [{ message: { role: 'assistant', content: 'Done.' } }] },
      }),
    ]);

    expect(items.map((i) => i.kind)).toEqual([
      'system',
      'message',
      'tool_call',
      'tool_result',
      'message',
    ]);
    expect(items[3]).toMatchObject({ name: 'lookup', output: { ok: true } });
  });

  it('falls back to the root input and output when there are no LLM spans', () => {
    const items = buildConversation([
      span({ kind: 'agent', parentId: null, input: 'question', output: { answer: 42 } }),
    ]);
    expect(items).toEqual([
      { kind: 'message', role: 'user', text: 'question' },
      { kind: 'message', role: 'assistant', text: '{\n  "answer": 42\n}' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { popcorn } from '../src';
import { FakeAnthropic, FakeOpenAI } from './fake-clients';
import { byName, collect, setup } from './helpers';

describe('wrapAnthropic', () => {
  it('records model, messages, usage and stop reason', async () => {
    const transport = setup();
    const client = popcorn.wrapAnthropic(new FakeAnthropic(['hi there']));
    await popcorn.trace('agent', () =>
      client.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );

    const [llm] = byName(await collect(transport), 'anthropic.messages');
    expect(llm).toMatchObject({
      kind: 'llm',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 50 },
      attributes: { 'popcorn.stop_reason': 'end_turn' },
    });
    expect((llm!.input as { messages: unknown[] }).messages).toHaveLength(1);
    expect((llm!.output as { content: Array<{ text: string }> }).content[0]!.text).toBe('hi there');
  });

  it('passes calls straight through outside a trace', async () => {
    const transport = setup();
    const client = popcorn.wrapAnthropic(new FakeAnthropic());
    await client.messages.create({ model: 'claude-opus-5-5' });
    expect(await collect(transport)).toHaveLength(0);
  });

  it('rebuilds the final message from a stream, including tool input JSON', async () => {
    const transport = setup();
    const client = popcorn.wrapAnthropic(new FakeAnthropic(['hello']));
    await popcorn.trace('agent', async () => {
      const stream = (await client.messages.create({
        model: 'claude-opus-5-5',
        stream: true,
      })) as AsyncIterable<unknown>;
      for await (const _event of stream) {
        // drain
      }
    });

    const [llm] = byName(await collect(transport), 'anthropic.messages');
    expect(llm!.output).toMatchObject({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', name: 'lookup', input: { orderId: 'A-1' } },
      ],
    });
    expect(llm!.usage).toEqual({ inputTokens: 80, outputTokens: 25 });
    expect(llm!.attributes?.['popcorn.streamed']).toBe(true);
  });

  it('records API errors on the span and rethrows', async () => {
    const transport = setup();
    const client = popcorn.wrapAnthropic(new FakeAnthropic());
    await expect(
      popcorn.trace('agent', () => client.messages.create({ model: 'broken' })),
    ).rejects.toThrow('overloaded');
    const [llm] = byName(await collect(transport), 'anthropic.messages');
    expect(llm).toMatchObject({
      status: 'error',
      error: { message: 'overloaded', type: 'Error (529)' },
    });
  });

  it('leaves the original client untouched', () => {
    const raw = new FakeAnthropic();
    const original = raw.messages.create;
    popcorn.wrapAnthropic(raw);
    expect(raw.messages.create).toBe(original);
  });
});

describe('wrapOpenAI', () => {
  it('splits cached prompt tokens out of the input count', async () => {
    const transport = setup();
    const client = popcorn.wrapOpenAI(new FakeOpenAI());
    await popcorn.trace('agent', () =>
      client.chat.completions.create({ model: 'gpt-4o', messages: [] }),
    );
    const [llm] = byName(await collect(transport), 'openai.chat');
    expect(llm).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-2024-08-06',
      usage: { inputTokens: 60, cacheReadTokens: 40, outputTokens: 10 },
    });
  });

  it('accumulates streamed content and tool call arguments', async () => {
    const transport = setup();
    const client = popcorn.wrapOpenAI(new FakeOpenAI());
    await popcorn.trace('agent', async () => {
      const stream = (await client.chat.completions.create({
        model: 'gpt-4o',
        stream: true,
      })) as AsyncIterable<unknown>;
      for await (const _chunk of stream) {
        // drain
      }
    });
    const [llm] = byName(await collect(transport), 'openai.chat');
    expect(llm!.output).toMatchObject({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: 'Hello',
            tool_calls: [{ id: 'c1', function: { name: 'lookup', arguments: '{"id":1}' } }],
          },
        },
      ],
    });
    expect(llm!.usage).toEqual({ inputTokens: 20, outputTokens: 5 });
  });
});

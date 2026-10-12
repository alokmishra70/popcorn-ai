import type { SpanPayload, StoredSpan } from '@popcornai/core';
import { hashArgs } from '@popcornai/core/node';
import { describe, expect, it, vi } from 'vitest';
import { FixtureMissError, popcorn, type ReplayBundle } from '../src';
import { FakeAnthropic } from './fake-clients';
import { collect, setup } from './helpers';

type Ticket = { orderId: string };

/** A tiny agent: ask the model, look up the order, ask the model again. */
function buildAgent(client: FakeAnthropic, lookupImpl: (args: Ticket) => Promise<unknown>) {
  const anthropic = popcorn.wrapAnthropic(client);
  const lookup = popcorn.tool('lookup_order', lookupImpl);
  return async (ticket: Ticket) => {
    await anthropic.messages.create({ model: 'claude-opus-5-5', system: 'v1', messages: [] });
    const order = await lookup({ orderId: ticket.orderId });
    const reply = (await anthropic.messages.create({
      model: 'claude-opus-5-5',
      system: 'v1',
      messages: [],
    })) as {
      content: Array<{ text: string }>;
    };
    return { order, reply: reply.content[0]!.text };
  };
}

async function recordOriginal(): Promise<ReplayBundle> {
  const transport = setup();
  const agent = buildAgent(new FakeAnthropic(['plan', 'original reply']), async ({ orderId }) => ({
    orderId,
    status: 'shipped',
  }));
  await popcorn.trace('triage', () => agent({ orderId: 'A-1' }), { input: { orderId: 'A-1' } });
  const spans = await collect(transport);
  const root = spans.find((s) => s.parentId === null)!;
  const tools = spans.filter((s) => s.kind === 'tool');
  return {
    run: { id: root.runId, name: root.name, input: root.input },
    spans: spans.map((s: SpanPayload): StoredSpan => ({ ...s, costUsd: null })),
    fixtures: tools.map((t) => ({
      toolName: t.name,
      argsHash: hashArgs(t.name, t.input),
      result: t.output,
      isError: false,
    })),
  };
}

describe('rewind', () => {
  it('serves tools from fixtures and calls the model live with overrides', async () => {
    const bundle = await recordOriginal();
    const client = new FakeAnthropic(['new plan', 'better reply']);
    const lookup = vi.fn();
    const transport = setup();

    const result = await popcorn.rewind(bundle.run.id, {
      bundle,
      agent: buildAgent(client, lookup),
      overrides: { system: 'v2', model: 'claude-sonnet-5-5' },
    });

    expect(result.error).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(result.output).toEqual({
      order: { orderId: 'A-1', status: 'shipped' },
      reply: 'better reply',
    });
    expect(client.calls.map((c) => [c.model, c.system])).toEqual([
      ['claude-sonnet-5-5', 'v2'],
      ['claude-sonnet-5-5', 'v2'],
    ]);
    expect(result.diff.finalOutput.changed).toBe(true);
    expect(result.diff.steps.map((s) => s.change)).toEqual(['changed', 'unchanged', 'changed']);

    const root = (await collect(transport)).find((s) => s.parentId === null)!;
    expect(root.attributes?.['popcorn.replay_of']).toBe(bundle.run.id);
    expect(root.runId).toBe(result.runId);
  });

  it('returns recorded LLM responses before fromStep', async () => {
    const bundle = await recordOriginal();
    const client = new FakeAnthropic(['live reply']);
    setup();

    const result = await popcorn.rewind(bundle.run.id, {
      bundle,
      agent: buildAgent(client, vi.fn()),
      fromStep: 2,
    });

    expect(client.calls).toHaveLength(1);
    expect(result.output).toMatchObject({ reply: 'live reply' });
    expect(result.diff.steps[0]!.change).toBe('unchanged');
  });

  it('fails on a fixture miss by default and can call the tool live instead', async () => {
    const bundle = await recordOriginal();
    setup();
    const lookup = vi.fn(async () => ({ status: 'pending' }));

    const strict = await popcorn.rewind(bundle.run.id, {
      bundle,
      input: { orderId: 'B-2' },
      agent: buildAgent(new FakeAnthropic(), lookup),
    });
    expect(strict.error).toBeInstanceOf(FixtureMissError);
    expect(lookup).not.toHaveBeenCalled();

    const live = await popcorn.rewind(bundle.run.id, {
      bundle,
      input: { orderId: 'B-2' },
      onFixtureMiss: 'live',
      agent: buildAgent(new FakeAnthropic(), lookup),
    });
    expect(live.error).toBeNull();
    expect(lookup).toHaveBeenCalledOnce();
  });
});

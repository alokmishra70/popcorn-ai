import { describe, expect, it } from 'vitest';
import { popcorn } from '../src';
import { byName, collect, setup } from './helpers';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('trace', () => {
  it('records a root agent span with input and output', async () => {
    const transport = setup();
    const result = await popcorn.trace('triage', async () => 'done', { input: { ticket: 1 } });
    const [root] = await collect(transport);

    expect(result).toBe('done');
    expect(root).toMatchObject({
      kind: 'agent',
      name: 'triage',
      parentId: null,
      status: 'ok',
      input: { ticket: 1 },
      output: 'done',
    });
    expect(root!.endTime).toBeGreaterThanOrEqual(root!.startTime);
  });

  it('keeps parent links across await and parallel branches', async () => {
    const transport = setup();
    const lookup = popcorn.tool('lookup', async (id: number) => {
      await sleep(id);
      return id * 2;
    });

    await popcorn.trace('agent', async () => {
      await sleep(1);
      await popcorn.trace('plan', async () => {
        await Promise.all([lookup(3), lookup(1)]);
      });
      await lookup(2);
    });

    const spans = await collect(transport);
    const [root] = byName(spans, 'agent');
    const [plan] = byName(spans, 'plan');
    const lookups = byName(spans, 'lookup');

    expect(plan!.parentId).toBe(root!.id);
    expect(lookups.filter((s) => s.parentId === plan!.id)).toHaveLength(2);
    expect(lookups.filter((s) => s.parentId === root!.id)).toHaveLength(1);
    expect(new Set(spans.map((s) => s.runId)).size).toBe(1);
  });

  it('records errors and rethrows them', async () => {
    const transport = setup();
    await expect(
      popcorn.trace('agent', async () => {
        throw new TypeError('bad input');
      }),
    ).rejects.toThrow('bad input');

    const [root] = await collect(transport);
    expect(root).toMatchObject({
      status: 'error',
      error: { message: 'bad input', type: 'TypeError' },
    });
  });

  it('separate top-level traces get separate runs', async () => {
    const transport = setup();
    await Promise.all([popcorn.trace('a', async () => 1), popcorn.trace('b', async () => 2)]);
    const spans = await collect(transport);
    expect(new Set(spans.map((s) => s.runId)).size).toBe(2);
  });

  it('does not export unsampled runs but still runs them', async () => {
    const transport = setup({ sampleRate: 0 });
    expect(await popcorn.trace('agent', async () => 42)).toBe(42);
    expect(await collect(transport)).toHaveLength(0);
  });

  it('agent() traces calls under the agent name with the input recorded', async () => {
    const transport = setup();
    const echo = popcorn.agent('echo', async (input: { text: string }) => input.text.toUpperCase());
    expect(await echo({ text: 'hi' })).toBe('HI');
    const [root] = await collect(transport);
    expect(root).toMatchObject({ name: 'echo', input: { text: 'hi' }, output: 'HI' });
  });
});

describe('tool', () => {
  it('passes through untraced outside a run', async () => {
    const transport = setup();
    const add = popcorn.tool('add', (a: number, b: number) => a + b);
    expect(await add(1, 2)).toBe(3);
    expect(await collect(transport)).toHaveLength(0);
  });

  it('records multiple arguments as an array and attaches an args hash', async () => {
    const transport = setup();
    const add = popcorn.tool('add', (a: number, b: number) => a + b);
    await popcorn.trace('agent', () => add(1, 2));
    const [span] = byName(await collect(transport), 'add');
    expect(span).toMatchObject({ kind: 'tool', input: [1, 2], output: 3 });
    expect(span!.attributes?.['popcorn.args_hash']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serves cached results within the TTL', async () => {
    const transport = setup();
    let calls = 0;
    const lookup = popcorn.tool('lookup', async (id: string) => ({ id, n: ++calls }), {
      cache: { ttlMs: 60_000 },
    });
    await popcorn.trace('agent', async () => {
      await lookup('a');
      await lookup('a');
      await lookup('b');
    });
    expect(calls).toBe(2);
    const outcomes = byName(await collect(transport), 'lookup').map(
      (s) => s.attributes?.['popcorn.cache'],
    );
    expect(outcomes).toEqual(['miss', 'hit', 'miss']);
  });
});

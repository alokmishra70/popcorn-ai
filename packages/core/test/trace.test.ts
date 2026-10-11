import { describe, expect, it } from 'vitest';
import { buildSpanTree, flattenTree, listSteps, sumUsage } from '../src';
import { run, span } from './fixtures';

describe('buildSpanTree', () => {
  it('nests children under their parent in start order', () => {
    const [root, llm, tool] = run([
      { kind: 'llm', name: 'claude' },
      { kind: 'tool', name: 'lookup_order' },
    ]);
    const nested = span({ kind: 'llm', name: 'inner', parentId: tool!.id });

    const [tree] = buildSpanTree([nested, tool!, root!, llm!]);
    expect(tree!.span.id).toBe(root!.id);
    expect(tree!.children.map((c) => c.span.name)).toEqual(['claude', 'lookup_order']);
    expect(tree!.children[1]!.children[0]!.depth).toBe(2);
  });

  it('adopts spans whose parent is missing under the root', () => {
    const [root] = run([]);
    const orphan = span({
      kind: 'tool',
      name: 'orphan',
      parentId: '00000000-0000-4000-8000-00000000ffff',
    });
    const tree = buildSpanTree([root!, orphan]);
    expect(tree).toHaveLength(1);
    expect(flattenTree(tree).map((n) => n.span.name)).toEqual(['agent', 'orphan']);
  });
});

describe('listSteps and sumUsage', () => {
  it('counts llm and tool spans as steps and sums llm usage', () => {
    const spans = run([
      {
        kind: 'llm',
        name: 'a',
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 },
        costUsd: 0.01,
      },
      { kind: 'step', name: 'plan' },
      { kind: 'tool', name: 'b' },
      { kind: 'llm', name: 'c', usage: { inputTokens: 200, outputTokens: 20 }, costUsd: 0.02 },
    ]);
    expect(listSteps(spans).map((s) => s.name)).toEqual(['a', 'b', 'c']);
    expect(sumUsage(spans)).toEqual({ tokensIn: 350, tokensOut: 30, costUsd: 0.03 });
  });
});

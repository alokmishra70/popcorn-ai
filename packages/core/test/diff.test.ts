import { describe, expect, it } from 'vitest';
import { diffRuns } from '../src';
import { run } from './fixtures';

describe('diffRuns', () => {
  it('marks identical steps unchanged', () => {
    const original = run([{ kind: 'tool', name: 'lookup', input: { id: 1 }, output: 'ok' }], {
      output: 'done',
    });
    const replay = run([{ kind: 'tool', name: 'lookup', input: { id: 1 }, output: 'ok' }], {
      output: 'done',
    });
    const diff = diffRuns(original, replay);
    expect(diff.counts).toEqual({ unchanged: 1, changed: 0, added: 0, removed: 0 });
    expect(diff.finalOutput.changed).toBe(false);
  });

  it('aligns an inserted step instead of shifting later rows', () => {
    const original = run([
      { kind: 'llm', name: 'claude' },
      { kind: 'tool', name: 'reply' },
    ]);
    const replay = run([
      { kind: 'llm', name: 'claude' },
      { kind: 'tool', name: 'lookup' },
      { kind: 'tool', name: 'reply' },
    ]);
    const diff = diffRuns(original, replay);
    expect(diff.steps.map((s) => s.change)).toEqual(['unchanged', 'added', 'unchanged']);
  });

  it('reports which fields changed and the final output', () => {
    const original = run([{ kind: 'llm', name: 'claude', model: 'a', output: 'x' }], {
      output: { category: 'billing' },
    });
    const replay = run([{ kind: 'llm', name: 'claude', model: 'b', output: 'y' }], {
      output: { category: 'shipping' },
    });
    const diff = diffRuns(original, replay);
    expect(diff.steps[0]!.fields).toEqual(['output', 'model']);
    expect(diff.finalOutput.changed).toBe(true);
  });

  it('marks steps missing from the replay as removed', () => {
    const diff = diffRuns(
      run([
        { kind: 'tool', name: 'a' },
        { kind: 'tool', name: 'b' },
      ]),
      run([{ kind: 'tool', name: 'a' }]),
    );
    expect(diff.steps.map((s) => s.change)).toEqual(['unchanged', 'removed']);
  });
});

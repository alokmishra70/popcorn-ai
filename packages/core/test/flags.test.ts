import { describe, expect, it } from 'vitest';
import { SpanAttr, detectFlags, defaultFlagThresholds } from '../src';
import { run } from './fixtures';

describe('detectFlags', () => {
  it('returns no flags for a clean run', () => {
    expect(detectFlags(run([{ kind: 'llm', name: 'claude' }]))).toEqual([]);
  });

  it('flags errors on the root span', () => {
    expect(detectFlags(run([], { status: 'error' }))).toContain('error');
  });

  it('flags a loop when the same tool and args repeat', () => {
    const call = {
      kind: 'tool' as const,
      name: 'lookup_order',
      attributes: { [SpanAttr.ArgsHash]: 'abc' },
    };
    expect(detectFlags(run([call, call]))).not.toContain('loop');
    expect(detectFlags(run([call, call, call]))).toContain('loop');
  });

  it('does not flag repeated calls with different args', () => {
    const spans = run(
      ['a', 'b', 'c'].map((hash) => ({
        kind: 'tool' as const,
        name: 'lookup',
        attributes: { [SpanAttr.ArgsHash]: hash },
      })),
    );
    expect(detectFlags(spans)).not.toContain('loop');
  });

  it('flags cost spikes and max steps against thresholds', () => {
    const spans = run([
      { kind: 'llm', name: 'a', costUsd: 0.4 },
      { kind: 'llm', name: 'b', costUsd: 0.2 },
    ]);
    expect(detectFlags(spans)).toContain('cost_spike');
    expect(detectFlags(spans, { ...defaultFlagThresholds, maxSteps: 2 })).toContain('max_steps');
  });
});

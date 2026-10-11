import { describe, expect, it } from 'vitest';
import { compareEvalRuns, percentile, type CaseOutcome } from '../src';

const outcome = (id: string, passed: boolean, costUsd = 0.01, durationMs = 1000): CaseOutcome => ({
  testCaseId: id,
  name: `case ${id}`,
  passed,
  costUsd,
  durationMs,
});

describe('compareEvalRuns', () => {
  it('classifies fixed and broken cases and flags regressions', () => {
    const baseline = {
      id: 'b',
      cases: [outcome('1', true), outcome('2', false), outcome('3', true)],
    };
    const current = {
      id: 'c',
      cases: [outcome('1', true), outcome('2', true), outcome('3', false), outcome('4', true)],
    };
    const result = compareEvalRuns(current, baseline);

    expect(result.fixed).toBe(1);
    expect(result.broken).toBe(1);
    expect(result.regressed).toBe(true);
    expect(result.cases[0]).toMatchObject({ testCaseId: '3', change: 'broken' });
    expect(result.cases.find((c) => c.testCaseId === '4')?.change).toBe('new');
    expect(result.current.passRate).toBe(0.75);
  });

  it('works without a baseline', () => {
    const result = compareEvalRuns({ id: 'c', cases: [outcome('1', false)] }, null);
    expect(result.baseline).toBeNull();
    expect(result.regressed).toBe(false);
    expect(result.cases[0]!.change).toBe('still_failing');
  });
});

describe('percentile', () => {
  it('uses nearest-rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('collapseAttempts', () => {
  it('passes a case only when every attempt passes and marks disagreement as flaky', async () => {
    const { collapseAttempts } = await import('../src');
    const collapsed = collapseAttempts([
      { ...outcome('1', true, 0.01, 100), attempt: 0 },
      { ...outcome('1', false, 0.03, 300), attempt: 1 },
      { ...outcome('2', true), attempt: 0 },
      { ...outcome('2', true), attempt: 1 },
    ]);
    expect(collapsed.find((c) => c.testCaseId === '1')).toMatchObject({
      passed: false,
      flaky: true,
      passes: 1,
      costUsd: 0.02,
      durationMs: 200,
    });
    expect(collapsed.find((c) => c.testCaseId === '2')).toMatchObject({
      passed: true,
      flaky: false,
    });
  });
});

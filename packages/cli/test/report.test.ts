import { compareEvalRuns, type CaseOutcome } from '@popcorn-ai/core';
import { describe, expect, it } from 'vitest';
import { commentMarker, headline, renderMarkdown, stars } from '../src/review/report';
import type { ReviewReport } from '../src/review/runner';

const outcome = (id: string, passed: boolean): CaseOutcome => ({
  testCaseId: id,
  name: `case ${id}`,
  passed,
  costUsd: 0.01,
  durationMs: 1000,
});

function report(current: CaseOutcome[], baseline: CaseOutcome[] | null): ReviewReport {
  return {
    suite: 'support-v1',
    evalRunId: 'e1',
    uploaded: true,
    git: { sha: 'abcdef1234', branch: 'fix-prompt' },
    baseline: baseline ? { evalRunId: 'e0', sha: '1234567890', branch: 'main' } : null,
    comparison: compareEvalRuns(
      { id: 'e1', cases: current },
      baseline ? { id: 'e0', cases: baseline } : null,
    ),
    results: current.map((c) => ({
      testCaseId: c.testCaseId,
      name: c.name,
      attempt: 0,
      runId: null,
      passed: c.passed,
      checks: [
        {
          name: 'category',
          type: 'output_equals',
          passed: c.passed,
          reason: c.passed ? undefined : 'expected "refund", got "shipping"',
        },
      ],
      costUsd: c.costUsd,
      durationMs: c.durationMs,
      error: null,
    })),
    flaky: [],
    totalCostUsd: 0.03,
    durationMs: 4000,
  };
}

describe('headline', () => {
  it('leads with the score, the trend against main and new bloopers', () => {
    const r = report(
      [outcome('1', true), outcome('2', true), outcome('3', false)],
      [outcome('1', true), outcome('2', false), outcome('3', true)],
    );
    expect(headline(r)).toBe('Reviews are in: 2/3, same as main. 1 new blooper.');
  });

  it('reports improvements without bloopers', () => {
    const r = report(
      [outcome('1', true), outcome('2', true)],
      [outcome('1', true), outcome('2', false)],
    );
    expect(headline(r)).toBe('Reviews are in: 2/2, up 1 from main. No new bloopers.');
  });

  it('works without a baseline', () => {
    expect(headline(report([outcome('1', true)], null))).toBe(
      'Reviews are in: 1/1. No new bloopers.',
    );
  });
});

describe('renderMarkdown', () => {
  it('starts with the marker the GitHub Action uses and lists broken cases with reasons', () => {
    const md = renderMarkdown(report([outcome('1', false)], [outcome('1', true)]));
    expect(md.startsWith(commentMarker('support-v1'))).toBe(true);
    expect(md).toContain('| Passing | 0/1 (0.0%) | 1/1 (100.0%) | -1 |');
    expect(md).toContain('main (1234567)');
    expect(md).toContain('`case 1` — category: expected "refund", got "shipping"');
  });
});

describe('stars', () => {
  it('rounds the pass rate to five stars', () => {
    expect(stars(0.925)).toBe('★★★★★');
    expect(stars(0.825)).toBe('★★★★☆');
    expect(stars(0)).toBe('☆☆☆☆☆');
  });
});

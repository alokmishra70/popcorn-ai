export interface CaseOutcome {
  testCaseId: string;
  name: string;
  passed: boolean;
  costUsd: number;
  durationMs: number;
}

export interface EvalRunOutcome {
  id: string;
  cases: CaseOutcome[];
}

export type CaseChange = 'fixed' | 'broken' | 'still_passing' | 'still_failing' | 'new' | 'dropped';

export interface CaseComparison {
  testCaseId: string;
  name: string;
  change: CaseChange;
  baseline: CaseOutcome | null;
  current: CaseOutcome | null;
}

export interface EvalAggregate {
  total: number;
  passed: number;
  passRate: number;
  costUsd: number;
  avgCostUsd: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

export interface EvalComparison {
  baseline: EvalAggregate | null;
  current: EvalAggregate;
  cases: CaseComparison[];
  fixed: number;
  broken: number;
  /** True when any case that passed on the baseline fails now. */
  regressed: boolean;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

export function aggregate(cases: readonly CaseOutcome[]): EvalAggregate {
  const passed = cases.filter((c) => c.passed).length;
  const costUsd = cases.reduce((sum, c) => sum + c.costUsd, 0);
  const latencies = cases.map((c) => c.durationMs);
  return {
    total: cases.length,
    passed,
    passRate: cases.length ? passed / cases.length : 0,
    costUsd: Math.round(costUsd * 1e6) / 1e6,
    avgCostUsd: cases.length ? Math.round((costUsd / cases.length) * 1e6) / 1e6 : 0,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
  };
}

/** Compares an eval run against a baseline, usually the latest run on main (FR-4.5). */
export function compareEvalRuns(
  current: EvalRunOutcome,
  baseline: EvalRunOutcome | null,
): EvalComparison {
  const before = new Map(baseline?.cases.map((c) => [c.testCaseId, c]));
  const after = new Map(current.cases.map((c) => [c.testCaseId, c]));
  const ids = new Set([...before.keys(), ...after.keys()]);

  const cases: CaseComparison[] = [];
  for (const id of ids) {
    const b = before.get(id) ?? null;
    const a = after.get(id) ?? null;
    cases.push({
      testCaseId: id,
      name: (a ?? b)!.name,
      change: classify(b, a, baseline !== null),
      baseline: b,
      current: a,
    });
  }

  const order: Record<CaseChange, number> = {
    broken: 0,
    fixed: 1,
    still_failing: 2,
    new: 3,
    dropped: 4,
    still_passing: 5,
  };
  cases.sort((x, y) => order[x.change] - order[y.change] || x.name.localeCompare(y.name));

  const fixed = cases.filter((c) => c.change === 'fixed').length;
  const broken = cases.filter((c) => c.change === 'broken').length;

  return {
    baseline: baseline ? aggregate(baseline.cases) : null,
    current: aggregate(current.cases),
    cases,
    fixed,
    broken,
    regressed: broken > 0,
  };
}

function classify(b: CaseOutcome | null, a: CaseOutcome | null, hasBaseline: boolean): CaseChange {
  if (!a) return 'dropped';
  if (!b) return hasBaseline ? 'new' : a.passed ? 'still_passing' : 'still_failing';
  if (b.passed && a.passed) return 'still_passing';
  if (!b.passed && !a.passed) return 'still_failing';
  return a.passed ? 'fixed' : 'broken';
}

export interface AttemptOutcome extends CaseOutcome {
  attempt: number;
}

export interface CollapsedOutcome extends CaseOutcome {
  attempts: number;
  passes: number;
  /** Attempts disagreed: some passed, some failed (FR-4.8). */
  flaky: boolean;
}

/**
 * Folds repeated attempts of the same case into one outcome. A case passes only
 * if every attempt passed; cost and latency are averaged.
 */
export function collapseAttempts(results: readonly AttemptOutcome[]): CollapsedOutcome[] {
  const groups = new Map<string, AttemptOutcome[]>();
  for (const result of results) {
    const list = groups.get(result.testCaseId) ?? [];
    list.push(result);
    groups.set(result.testCaseId, list);
  }

  return [...groups.values()].map((attempts) => {
    const passes = attempts.filter((a) => a.passed).length;
    const mean = (pick: (a: AttemptOutcome) => number) =>
      attempts.reduce((sum, a) => sum + pick(a), 0) / attempts.length;
    return {
      testCaseId: attempts[0]!.testCaseId,
      name: attempts[0]!.name,
      passed: passes === attempts.length,
      costUsd: Math.round(mean((a) => a.costUsd) * 1e6) / 1e6,
      durationMs: mean((a) => a.durationMs),
      attempts: attempts.length,
      passes,
      flaky: passes > 0 && passes < attempts.length,
    };
  });
}

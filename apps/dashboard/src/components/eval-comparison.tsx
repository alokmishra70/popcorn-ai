import {
  formatDuration,
  formatPercent,
  formatUsd,
  type CaseChange,
  type EvalComparison,
} from '@popcorn-ai/core';
import { Stat } from './stat';
import { Badge, type BadgeTone } from './ui/badge';
import { Card, CardHeader, CardTitle } from './ui/card';

const changeTone: Record<CaseChange, BadgeTone> = {
  broken: 'danger',
  fixed: 'ok',
  still_failing: 'warn',
  still_passing: 'neutral',
  new: 'info',
  dropped: 'neutral',
};

function Delta({
  value,
  format,
  lowerIsBetter,
}: {
  value: number;
  format: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  if (Math.abs(value) < 1e-9) return <span className="text-muted">no change</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  return (
    <span className={good ? 'text-ok' : 'text-danger'}>
      {value > 0 ? '+' : '-'}
      {format(Math.abs(value))}
    </span>
  );
}

/** Pass rate, per-case changes, cost and latency deltas between two eval runs (FR-4.5). */
export function EvalComparisonView({
  comparison,
  baselineLabel,
}: {
  comparison: EvalComparison;
  baselineLabel: string;
}) {
  const { current, baseline } = comparison;
  const changed = comparison.cases.filter((c) => c.change !== 'still_passing');

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Pass rate"
          value={formatPercent(current.passRate, 1)}
          hint={
            baseline ? (
              <Delta
                value={(current.passRate - baseline.passRate) * 100}
                format={(n) => `${n.toFixed(1)} pts vs ${baselineLabel}`}
              />
            ) : (
              'no baseline'
            )
          }
        />
        <Stat
          label="Fixed / broken"
          value={`${comparison.fixed} / ${comparison.broken}`}
          hint={
            comparison.regressed ? (
              <span className="text-danger">regression</span>
            ) : (
              'no regressions'
            )
          }
        />
        <Stat
          label="Cost per case"
          value={formatUsd(current.avgCostUsd)}
          hint={
            baseline ? (
              <Delta
                value={current.avgCostUsd - baseline.avgCostUsd}
                format={formatUsd}
                lowerIsBetter
              />
            ) : undefined
          }
        />
        <Stat
          label="p95 latency"
          value={formatDuration(current.p95LatencyMs)}
          hint={
            baseline ? (
              <Delta
                value={current.p95LatencyMs - baseline.p95LatencyMs}
                format={formatDuration}
                lowerIsBetter
              />
            ) : undefined
          }
        />
      </div>
      {baseline && changed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Changes against {baselineLabel}</CardTitle>
          </CardHeader>
          <ul className="divide-y">
            {changed.map((c) => (
              <li
                key={c.testCaseId}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <span className="truncate">{c.name}</span>
                <Badge tone={changeTone[c.change]}>{c.change.replace('_', ' ')}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

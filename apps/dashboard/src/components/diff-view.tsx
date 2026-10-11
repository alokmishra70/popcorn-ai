import {
  formatDuration,
  formatTokens,
  formatUsd,
  type RunDiff,
  type StepChange,
  type StepView,
} from '@popcorn-ai/core';
import { cn } from '@/lib/utils';
import { JsonView } from './json-view';
import { KindIcon } from './span-kind';
import { Badge, type BadgeTone } from './ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from './ui/card';

const changeTone: Record<StepChange, BadgeTone> = {
  unchanged: 'neutral',
  changed: 'warn',
  added: 'ok',
  removed: 'danger',
};

function delta(before: number, after: number, format: (n: number) => string) {
  const diff = after - before;
  if (diff === 0) return <span className="text-muted">no change</span>;
  const pct = before ? ` (${diff > 0 ? '+' : ''}${((diff / before) * 100).toFixed(0)}%)` : '';
  return (
    <span className={diff < 0 ? 'text-ok' : 'text-danger'}>
      {diff > 0 ? '+' : '-'}
      {format(Math.abs(diff))}
      {pct}
    </span>
  );
}

function StepCell({ step }: { step: StepView | null }) {
  if (!step)
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted">not in this run</div>
    );
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        {step.model ? <span>{step.model}</span> : null}
        <span>{formatDuration(step.durationMs)}</span>
        {step.tokens ? <span>{formatTokens(step.tokens)} tok</span> : null}
        {step.fixture ? <Badge tone="info">fixture {step.fixture}</Badge> : null}
        {step.status === 'error' ? <Badge tone="danger">error</Badge> : null}
      </p>
      <JsonView
        value={step.kind === 'tool' ? { input: step.input, output: step.output } : step.output}
        className="max-h-80 overflow-auto"
      />
    </div>
  );
}

/** Original vs replayed run, step by step (FR-3.4). */
export function DiffView({ diff }: { diff: RunDiff }) {
  const { original, replay } = diff.totals;
  const metrics: Array<{
    label: string;
    before: number;
    after: number;
    format: (n: number) => string;
  }> = [
    { label: 'Steps', before: original.steps, after: replay.steps, format: String },
    { label: 'Tokens', before: original.tokens, after: replay.tokens, format: formatTokens },
    { label: 'Cost', before: original.costUsd, after: replay.costUsd, format: formatUsd },
    {
      label: 'Duration',
      before: original.durationMs,
      after: replay.durationMs,
      format: formatDuration,
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-4">
        {metrics.map(({ label, before, after, format }) => (
          <div key={label} className="rounded-lg border bg-surface px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 text-sm tabular-nums">
              {format(before)} → {format(after)}
            </p>
            <p className="text-xs">{delta(before, after, format)}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Final answer</CardTitle>
          <Badge tone={diff.finalOutput.changed ? 'warn' : 'neutral'}>
            {diff.finalOutput.changed ? 'changed' : 'unchanged'}
          </Badge>
        </CardHeader>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Original</p>
            <JsonView value={diff.finalOutput.original} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Rewind</p>
            <JsonView value={diff.finalOutput.replay} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <span className="text-xs text-muted">
            {diff.counts.unchanged} unchanged · {diff.counts.changed} changed · {diff.counts.added}{' '}
            added · {diff.counts.removed} removed
          </span>
        </CardHeader>
        <ol className="divide-y">
          {diff.steps.map((step, index) => {
            const view = step.replay ?? step.original!;
            return (
              <li
                key={index}
                className={cn('px-4 py-3', step.change === 'unchanged' && 'opacity-80')}
              >
                <details open={step.change !== 'unchanged'}>
                  <summary className="flex cursor-pointer items-center gap-2 text-sm">
                    <Badge tone={changeTone[step.change]}>{step.change}</Badge>
                    <KindIcon kind={view.kind} />
                    <span className="font-medium">{view.name}</span>
                    {step.fields.length ? (
                      <span className="text-xs text-muted">{step.fields.join(', ')} differ</span>
                    ) : null}
                  </summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <StepCell step={step.original} />
                    <StepCell step={step.replay} />
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

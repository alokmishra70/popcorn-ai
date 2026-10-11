import { canonicalJson } from './canonical';
import type { StoredSpan } from './schemas/run';
import type { SpanKind, SpanStatus } from './schemas/span';
import { SpanAttr } from './schemas/span';
import { findRootSpan, listSteps, sumUsage } from './trace';

export type StepChange = 'unchanged' | 'changed' | 'added' | 'removed';
export type StepField = 'input' | 'output' | 'status' | 'model';

export interface StepView {
  spanId: string;
  index: number;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  model: string | null;
  input: unknown;
  output: unknown;
  tokens: number;
  costUsd: number;
  durationMs: number;
  fixture: string | null;
}

export interface StepDiff {
  change: StepChange;
  fields: StepField[];
  original: StepView | null;
  replay: StepView | null;
}

export interface RunTotals {
  steps: number;
  tokens: number;
  costUsd: number;
  durationMs: number;
}

export interface RunDiff {
  steps: StepDiff[];
  finalOutput: { original: unknown; replay: unknown; changed: boolean };
  totals: { original: RunTotals; replay: RunTotals };
  counts: Record<StepChange, number>;
}

/**
 * Step-by-step diff of two runs of the same agent (FR-3.4). Steps are aligned by
 * kind and name with a longest-common-subsequence pass, so an extra tool call in
 * the replay shows up as one added step instead of shifting every later row.
 */
export function diffRuns(original: readonly StoredSpan[], replay: readonly StoredSpan[]): RunDiff {
  const a = listSteps(original).map(toView);
  const b = listSteps(replay).map(toView);
  const steps = align(a, b);

  const counts: Record<StepChange, number> = { unchanged: 0, changed: 0, added: 0, removed: 0 };
  for (const step of steps) counts[step.change] += 1;

  const originalOutput = findRootSpan(original)?.output ?? null;
  const replayOutput = findRootSpan(replay)?.output ?? null;

  return {
    steps,
    finalOutput: {
      original: originalOutput,
      replay: replayOutput,
      changed: canonicalJson(originalOutput) !== canonicalJson(replayOutput),
    },
    totals: { original: totals(original), replay: totals(replay) },
    counts,
  };
}

function toView(span: StoredSpan, index: number): StepView {
  const fixture = span.attributes?.[SpanAttr.Fixture];
  return {
    spanId: span.id,
    index,
    kind: span.kind,
    name: span.name,
    status: span.status,
    model: span.model ?? null,
    input: span.input ?? null,
    output: span.output ?? null,
    tokens: (span.usage?.inputTokens ?? 0) + (span.usage?.outputTokens ?? 0),
    costUsd: span.costUsd ?? 0,
    durationMs: Math.max(0, span.endTime - span.startTime),
    fixture: typeof fixture === 'string' ? fixture : null,
  };
}

function totals(spans: readonly StoredSpan[]): RunTotals {
  const root = findRootSpan(spans);
  const usage = sumUsage(spans);
  return {
    steps: listSteps(spans).length,
    tokens: usage.tokensIn + usage.tokensOut,
    costUsd: usage.costUsd,
    durationMs: root ? Math.max(0, root.endTime - root.startTime) : 0,
  };
}

const signature = (step: StepView) => `${step.kind}:${step.name}`;

function align(a: StepView[], b: StepView[]): StepDiff[] {
  // lengths[i][j] = LCS length of a[i..] and b[j..]
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        signature(a[i]!) === signature(b[j]!)
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const out: StepDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i]!;
    const right = b[j]!;
    if (signature(left) === signature(right)) {
      const fields = changedFields(left, right);
      out.push({
        change: fields.length ? 'changed' : 'unchanged',
        fields,
        original: left,
        replay: right,
      });
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      out.push({ change: 'removed', fields: [], original: left, replay: null });
      i++;
    } else {
      out.push({ change: 'added', fields: [], original: null, replay: right });
      j++;
    }
  }
  for (; i < a.length; i++)
    out.push({ change: 'removed', fields: [], original: a[i]!, replay: null });
  for (; j < b.length; j++)
    out.push({ change: 'added', fields: [], original: null, replay: b[j]! });
  return out;
}

function changedFields(a: StepView, b: StepView): StepField[] {
  const fields: StepField[] = [];
  if (canonicalJson(a.input) !== canonicalJson(b.input)) fields.push('input');
  if (canonicalJson(a.output) !== canonicalJson(b.output)) fields.push('output');
  if (a.status !== b.status) fields.push('status');
  if (a.model !== b.model) fields.push('model');
  return fields;
}

import type { RunFlag, StoredSpan } from './schemas/run';
import { SpanAttr } from './schemas/span';
import { findRootSpan, listSteps, sumUsage } from './trace';

export interface FlagThresholds {
  /** Flag the run when its total cost exceeds this many USD. */
  costThresholdUsd: number;
  /** Flag the run when it makes this many steps or more. */
  maxSteps: number;
  /** Same tool with the same arguments this many times counts as a loop. */
  loopRepeats: number;
}

export const defaultFlagThresholds: FlagThresholds = {
  costThresholdUsd: 0.5,
  maxSteps: 25,
  loopRepeats: 3,
};

/**
 * Anomaly flags for a run (FR-2.4). Tool spans are compared by their args hash,
 * which the SDK attaches; spans without one fall back to their serialized input.
 */
export function detectFlags(
  spans: readonly StoredSpan[],
  thresholds: FlagThresholds = defaultFlagThresholds,
): RunFlag[] {
  const flags = new Set<RunFlag>();
  const root = findRootSpan(spans);

  if (root?.status === 'error' || spans.some((s) => s.kind === 'llm' && s.status === 'error')) {
    flags.add('error');
  }

  const repeats = new Map<string, number>();
  for (const span of spans) {
    if (span.kind !== 'tool') continue;
    const hash = span.attributes?.[SpanAttr.ArgsHash];
    const key = `${span.name}\u0000${typeof hash === 'string' ? hash : JSON.stringify(span.input ?? null)}`;
    const count = (repeats.get(key) ?? 0) + 1;
    repeats.set(key, count);
    if (count >= thresholds.loopRepeats) flags.add('loop');
  }

  if (sumUsage(spans).costUsd > thresholds.costThresholdUsd) flags.add('cost_spike');

  const hitMaxSteps = root?.attributes?.[SpanAttr.MaxStepsHit] === true;
  if (hitMaxSteps || listSteps(spans).length >= thresholds.maxSteps) flags.add('max_steps');

  return [...flags].sort();
}

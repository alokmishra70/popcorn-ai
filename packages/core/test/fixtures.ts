import { randomUUID } from 'node:crypto';
import type { StoredSpan } from '../src';

export const RUN_ID = '00000000-0000-4000-8000-000000000001';

let clock = 1_700_000_000_000;

export function resetClock() {
  clock = 1_700_000_000_000;
}

export function span(
  overrides: Partial<StoredSpan> & Pick<StoredSpan, 'kind' | 'name'>,
): StoredSpan {
  const startTime = overrides.startTime ?? (clock += 10);
  return {
    id: randomUUID(),
    runId: RUN_ID,
    parentId: null,
    status: 'ok',
    startTime,
    endTime: overrides.endTime ?? startTime + 5,
    ...overrides,
  };
}

/** A root agent span plus children, wired to it in order. */
export function run(
  children: Array<Partial<StoredSpan> & Pick<StoredSpan, 'kind' | 'name'>>,
  root: Partial<StoredSpan> = {},
) {
  const rootSpan = span({ kind: 'agent', name: 'agent', ...root });
  const childSpans = children.map((c) => span({ parentId: rootSpan.id, ...c }));
  rootSpan.endTime = Math.max(rootSpan.endTime, ...childSpans.map((c) => c.endTime));
  return [rootSpan, ...childSpans];
}

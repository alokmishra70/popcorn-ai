import { performance } from 'node:perf_hooks';

/** Epoch milliseconds with sub-millisecond precision, monotonic within the process. */
export function now(): number {
  return performance.timeOrigin + performance.now();
}

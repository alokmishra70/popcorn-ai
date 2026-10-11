import type { StoredSpan } from '@popcorn-ai/core';
import { describe, expect, it } from 'vitest';
import { computeWaterfall } from './waterfall';

const span = (
  id: string,
  parentId: string | null,
  startTime: number,
  endTime: number,
): StoredSpan => ({
  id,
  runId: 'r',
  parentId,
  kind: parentId ? 'tool' : 'agent',
  name: id,
  status: 'ok',
  startTime,
  endTime,
});

describe('computeWaterfall', () => {
  it('positions bars on the run time axis and tracks ancestors', () => {
    const { rows, totalMs } = computeWaterfall([
      span('root', null, 1000, 2000),
      span('a', 'root', 1000, 1500),
      span('b', 'root', 1200, 1700),
      span('c', 'b', 1300, 1301),
    ]);
    expect(totalMs).toBe(1000);
    expect(rows.map((r) => [r.span.id, r.depth, r.offsetPct])).toEqual([
      ['root', 0, 0],
      ['a', 1, 0],
      ['b', 1, 20],
      ['c', 2, 30],
    ]);
    expect(rows[3]!.ancestors).toEqual(['root', 'b']);
    expect(rows[3]!.widthPct).toBeGreaterThanOrEqual(0.4);
    expect(rows[2]!.hasChildren).toBe(true);
  });

  it('handles an empty run', () => {
    expect(computeWaterfall([]).rows).toEqual([]);
  });
});

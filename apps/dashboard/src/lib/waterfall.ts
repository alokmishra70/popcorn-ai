import { buildSpanTree, flattenTree, formatDuration, type StoredSpan } from '@popcornai/core';

export interface WaterfallRow {
  span: StoredSpan;
  depth: number;
  /** Percent of the run's duration before this span starts. */
  offsetPct: number;
  /** Percent of the run's duration this span covers; at least MIN_WIDTH_PCT so short spans stay clickable. */
  widthPct: number;
  hasChildren: boolean;
  /** Ancestor span ids, root first; used to hide rows under a collapsed parent. */
  ancestors: string[];
}

export interface Waterfall {
  rows: WaterfallRow[];
  startMs: number;
  totalMs: number;
  ticks: Array<{ pct: number; label: string }>;
}

const MIN_WIDTH_PCT = 0.4;
const TICKS = 5;

/** Lays out spans on a shared time axis (FR-2.1). Parallel calls overlap on the x axis in separate rows. */
export function computeWaterfall(spans: readonly StoredSpan[]): Waterfall {
  if (spans.length === 0) return { rows: [], startMs: 0, totalMs: 0, ticks: [] };

  const startMs = Math.min(...spans.map((s) => s.startTime));
  const endMs = Math.max(...spans.map((s) => s.endTime));
  const totalMs = Math.max(endMs - startMs, 1);
  const pct = (ms: number) => (ms / totalMs) * 100;

  const ancestorsById = new Map<string, string[]>();
  const rows = flattenTree(buildSpanTree(spans)).map((node) => {
    const ancestors =
      node.span.parentId && ancestorsById.has(node.span.parentId)
        ? [...ancestorsById.get(node.span.parentId)!, node.span.parentId]
        : [];
    ancestorsById.set(node.span.id, ancestors);
    const offsetPct = pct(node.span.startTime - startMs);
    return {
      span: node.span,
      depth: node.depth,
      offsetPct,
      widthPct: Math.min(
        Math.max(pct(node.span.endTime - node.span.startTime), MIN_WIDTH_PCT),
        100 - offsetPct,
      ),
      hasChildren: node.children.length > 0,
      ancestors,
    };
  });

  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => ({
    pct: (i / TICKS) * 100,
    label: formatDuration((totalMs * i) / TICKS),
  }));

  return { rows, startMs, totalMs, ticks };
}

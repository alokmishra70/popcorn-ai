import type { StoredSpan } from './schemas/run';

export interface SpanNode<S extends StoredSpan = StoredSpan> {
  span: S;
  depth: number;
  children: SpanNode<S>[];
}

const byStartTime = (a: StoredSpan, b: StoredSpan) =>
  a.startTime - b.startTime || a.endTime - b.endTime || a.id.localeCompare(b.id);

/**
 * Builds the span tree for one run. Spans whose parent never arrived (dropped by
 * the SDK, or still in flight) are attached to the root so they stay visible.
 */
export function buildSpanTree<S extends StoredSpan>(spans: readonly S[]): SpanNode<S>[] {
  const nodes = new Map<string, SpanNode<S>>();
  for (const span of spans) nodes.set(span.id, { span, depth: 0, children: [] });

  const roots: SpanNode<S>[] = [];
  for (const node of nodes.values()) {
    const parent = node.span.parentId ? nodes.get(node.span.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortAndSetDepth = (list: SpanNode<S>[], depth: number) => {
    list.sort((a, b) => byStartTime(a.span, b.span));
    for (const node of list) {
      node.depth = depth;
      sortAndSetDepth(node.children, depth + 1);
    }
  };

  // Orphans: keep the earliest true root first, adopt the rest beneath it.
  sortAndSetDepth(roots, 0);
  const [primary, ...orphans] = roots.filter((n) => n.span.parentId === null);
  const unparented = roots.filter((n) => n.span.parentId !== null);
  if (primary && unparented.length > 0) {
    primary.children.push(...unparented);
    sortAndSetDepth(primary.children, 1);
    return [primary, ...orphans];
  }
  return roots;
}

/** Depth-first, start-ordered flattening of the tree. Used by the waterfall and the span list. */
export function flattenTree<S extends StoredSpan>(roots: readonly SpanNode<S>[]): SpanNode<S>[] {
  const out: SpanNode<S>[] = [];
  const visit = (node: SpanNode<S>) => {
    out.push(node);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return out;
}

export function findRootSpan<S extends StoredSpan>(spans: readonly S[]): S | undefined {
  return spans.filter((s) => s.parentId === null).sort(byStartTime)[0];
}

/**
 * The "steps" of a run: LLM and tool calls in start order. Step numbers are
 * what `fromStep` in replay and the `max_steps` check refer to.
 */
export function listSteps<S extends StoredSpan>(spans: readonly S[]): S[] {
  return spans.filter((s) => s.kind === 'llm' || s.kind === 'tool').sort(byStartTime);
}

export function sumUsage(spans: readonly StoredSpan[]) {
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  for (const span of spans) {
    if (span.kind !== 'llm') continue;
    tokensIn += (span.usage?.inputTokens ?? 0) + (span.usage?.cacheReadTokens ?? 0);
    tokensOut += span.usage?.outputTokens ?? 0;
    costUsd += span.costUsd ?? 0;
  }
  return { tokensIn, tokensOut, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}

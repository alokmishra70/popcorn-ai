'use client';

import { formatDuration, SpanAttr } from '@popcornai/core';
import { ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { Waterfall } from '@/lib/waterfall';
import { KindIcon, kindStyles } from './span-kind';

interface Props {
  waterfall: Waterfall;
  selectedId: string | null;
  onSelect: (spanId: string) => void;
}

/**
 * Scene by Scene: span waterfall with a collapsible tree (FR-1.8, FR-2.1).
 * Arrow keys move between rows, left/right collapse and expand, Enter selects.
 */
export function WaterfallView({ waterfall, selectedId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const visible = useMemo(
    () => waterfall.rows.filter((row) => !row.ancestors.some((id) => collapsed.has(id))),
    [waterfall.rows, collapsed],
  );

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      const shouldOpen = open ?? next.has(id);
      if (shouldOpen) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const row = visible[index]!;
    const focusRow = (i: number) => {
      const target = visible[Math.min(Math.max(i, 0), visible.length - 1)];
      if (target) rowRefs.current.get(target.span.id)?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(index - 1);
        break;
      case 'ArrowLeft':
        if (row.hasChildren && !collapsed.has(row.span.id)) toggle(row.span.id, false);
        else if (row.ancestors.length)
          rowRefs.current.get(row.ancestors[row.ancestors.length - 1]!)?.focus();
        break;
      case 'ArrowRight':
        if (row.hasChildren) toggle(row.span.id, true);
        break;
    }
  };

  return (
    <div className="text-sm">
      <div className="sticky top-0 z-10 grid grid-cols-[minmax(220px,34%)_1fr] border-b bg-surface text-xs text-muted">
        <div className="px-3 py-1.5">Span</div>
        <div className="relative h-7">
          {waterfall.ticks.map((tick) => (
            <span
              key={tick.pct}
              className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap tabular-nums first:translate-x-0 last:-translate-x-full"
              style={{ left: `${tick.pct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div role="tree" aria-label="Spans">
        {visible.map((row, index) => {
          const { span } = row;
          const selected = span.id === selectedId;
          const fixture = span.attributes?.[SpanAttr.Fixture];
          const cache = span.attributes?.[SpanAttr.Cache];
          return (
            <button
              key={span.id}
              ref={(el) => {
                if (el) rowRefs.current.set(span.id, el);
                else rowRefs.current.delete(span.id);
              }}
              type="button"
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={selected}
              aria-expanded={row.hasChildren ? !collapsed.has(span.id) : undefined}
              onClick={() => onSelect(span.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'grid w-full grid-cols-[minmax(220px,34%)_1fr] items-center border-b border-border/60 text-left hover:bg-surface-muted/70',
                selected && 'bg-brand-soft/60 hover:bg-brand-soft/60',
              )}
            >
              <span
                className="flex min-w-0 items-center gap-1.5 px-3 py-1.5"
                style={{ paddingLeft: `${12 + row.depth * 16}px` }}
              >
                {row.hasChildren ? (
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-muted transition-transform',
                      !collapsed.has(span.id) && 'rotate-90',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(span.id);
                    }}
                  />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <KindIcon
                  kind={span.kind}
                  className={span.status === 'error' ? 'text-danger' : 'text-muted'}
                />
                <span
                  className={cn('truncate', span.status === 'error' && 'text-danger')}
                  title={span.model ? `${span.name} · ${span.model}` : span.name}
                >
                  {span.name}
                </span>
                {fixture ? (
                  <span className="text-[10px] text-info uppercase">fixture {String(fixture)}</span>
                ) : null}
                {cache === 'hit' ? (
                  <span className="text-[10px] text-ok uppercase">cached</span>
                ) : null}
              </span>
              <span className="relative h-7">
                <span
                  className={cn(
                    'absolute top-1.5 h-4 rounded-sm',
                    span.status === 'error' ? 'bg-danger' : kindStyles[span.kind].bar,
                    selected && 'ring-2 ring-foreground/40',
                  )}
                  style={{ left: `${row.offsetPct}%`, width: `${row.widthPct}%` }}
                />
                <span
                  className="absolute top-1.5 text-xs whitespace-nowrap text-muted tabular-nums"
                  style={
                    row.offsetPct + row.widthPct > 80
                      ? { right: `${100 - row.offsetPct + 0.5}%` }
                      : { left: `calc(${row.offsetPct + row.widthPct}% + 6px)` }
                  }
                >
                  {formatDuration(span.endTime - span.startTime)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

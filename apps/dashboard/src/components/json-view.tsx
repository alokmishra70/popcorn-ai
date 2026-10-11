'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';

const LONG_STRING = 280;

function Primitive({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (value === null || value === undefined) return <span className="text-muted">null</span>;
  if (typeof value === 'string') {
    const long = value.length > LONG_STRING;
    const shown = long && !expanded ? `${value.slice(0, LONG_STRING)}...` : value;
    return (
      <span className="break-words whitespace-pre-wrap text-ok">
        &quot;{shown}&quot;
        {long ? (
          <button
            type="button"
            className="ml-1 text-xs text-info hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'less' : `+${(value.length - LONG_STRING).toLocaleString()} chars`}
          </button>
        ) : null}
      </span>
    );
  }
  if (typeof value === 'number') return <span className="text-info">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-warn">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function Node({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const isContainer = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 2);
  const label = name !== undefined ? <span className="text-muted">{name}: </span> : null;

  if (!isContainer) {
    return (
      <div className="pl-4">
        {label}
        <Primitive value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as object);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div className="pl-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="-ml-4 flex items-center text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-muted transition-transform', open && 'rotate-90')}
        />
        {label}
        <span className="text-muted">{summary}</span>
      </button>
      {open
        ? entries.map(([key, child]) => (
            <Node key={key} name={key} value={child} depth={depth + 1} />
          ))
        : null}
    </div>
  );
}

/** Collapsible JSON tree for span payloads. Top two levels open by default. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  if (value === undefined) return <p className="text-sm text-muted">Not recorded.</p>;
  return (
    <div
      className={cn(
        'relative rounded-md border bg-surface-muted/50 p-3 font-mono text-xs leading-relaxed',
        className,
      )}
    >
      <div className="absolute top-1 right-1">
        <CopyButton text={JSON.stringify(value, null, 2)} label="Copy JSON" />
      </div>
      <div className="-ml-4 overflow-x-auto pr-8">
        <Node value={value} depth={0} />
      </div>
    </div>
  );
}

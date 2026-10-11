'use client';

import { formatDuration, formatTokens, formatUsd, type StoredSpan } from '@popcorn-ai/core';
import { JsonView } from './json-view';
import { Badge } from './ui/badge';
import { KindIcon } from './span-kind';

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  );
}

/** Everything recorded on one span (FR-1.8): timings, usage and full input/output JSON. */
export function SpanDetail({ span, runStartMs }: { span: StoredSpan; runStartMs: number }) {
  const tokens = span.usage
    ? span.usage.inputTokens + span.usage.outputTokens + (span.usage.cacheReadTokens ?? 0)
    : null;
  const { input, output, error, attributes } = span;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <KindIcon kind={span.kind} />
        <h3 className="truncate font-semibold">{span.name}</h3>
        <Badge tone={span.status === 'error' ? 'danger' : 'ok'}>{span.status}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Meta label="Kind" value={span.kind} />
        <Meta label="Duration" value={formatDuration(span.endTime - span.startTime)} />
        <Meta
          label="Starts at"
          value={
            span.startTime - runStartMs < 1
              ? 'run start'
              : `+${formatDuration(span.startTime - runStartMs)}`
          }
        />
        {span.model ? <Meta label="Model" value={span.model} /> : null}
        {tokens !== null ? (
          <Meta
            label="Tokens in / out"
            value={`${formatTokens(span.usage!.inputTokens + (span.usage!.cacheReadTokens ?? 0))} / ${formatTokens(span.usage!.outputTokens)}`}
          />
        ) : null}
        {span.usage?.cacheReadTokens ? (
          <Meta label="Cache read" value={formatTokens(span.usage.cacheReadTokens)} />
        ) : null}
        {span.costUsd !== null && span.costUsd !== undefined ? (
          <Meta label="Cost" value={formatUsd(span.costUsd)} />
        ) : null}
      </dl>
      {error ? (
        <section>
          <h4 className="mb-1.5 text-xs font-medium text-danger">Error</h4>
          <JsonView value={error} />
        </section>
      ) : null}
      <section>
        <h4 className="mb-1.5 text-xs font-medium text-muted">Input</h4>
        <JsonView value={input} />
      </section>
      <section>
        <h4 className="mb-1.5 text-xs font-medium text-muted">Output</h4>
        <JsonView value={output} />
      </section>
      {attributes && Object.keys(attributes).length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-medium text-muted">Attributes</h4>
          <JsonView value={attributes} />
        </section>
      ) : null}
    </div>
  );
}

import {
  formatDuration,
  formatTokens,
  formatUsd,
  listSteps,
  type RunFlag,
  type RunStatus,
  type StoredSpan,
} from '@popcorn-ai/core';
import type { ApiClient } from '@popcorn-ai/cli';

/*
 * Tool handlers for the MCP server, kept separate from the transport so they
 * can be tested directly. Output is compact text: an agent debugging a run
 * needs the shape of what happened, not every byte of every payload.
 */

const PAYLOAD_LIMIT = 1500;

export interface RunListItem {
  id: string;
  name: string;
  status: RunStatus;
  startedAt: string;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  flags: RunFlag[];
  stepCount: number;
  error: string | null;
}

export interface SearchRunsArgs {
  query?: string;
  status?: RunStatus;
  flag?: RunFlag;
  name?: string;
  limit?: number;
}

export async function searchRuns(api: ApiClient, args: SearchRunsArgs): Promise<string> {
  const params = new URLSearchParams({ limit: String(Math.min(args.limit ?? 20, 50)) });
  if (args.query) params.set('q', args.query);
  if (args.status) params.set('status', args.status);
  if (args.flag) params.set('flags', args.flag);
  if (args.name) params.set('name', args.name);

  const { items } = await api.get<{ items: RunListItem[] }>(`/v1/runs?${params}`);
  if (items.length === 0) return 'No runs match.';

  return items
    .map((run) =>
      [
        run.id,
        run.name,
        run.status,
        new Date(run.startedAt).toISOString(),
        formatDuration(run.durationMs),
        `${run.stepCount} steps`,
        `${formatTokens(run.tokensIn + run.tokensOut)} tokens`,
        formatUsd(run.costUsd),
        run.flags.length ? `flags: ${run.flags.join(',')}` : '',
        run.error ? `error: ${run.error.slice(0, 200)}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
}

const clip = (value: unknown) => {
  if (value === undefined || value === null) return 'null';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > PAYLOAD_LIMIT
    ? `${text.slice(0, PAYLOAD_LIMIT)}... [${text.length - PAYLOAD_LIMIT} more chars]`
    : text;
};

interface RunDetail {
  run: RunListItem & {
    input: unknown;
    output: unknown;
    models: string[];
    replayOfRunId: string | null;
  };
  spans: StoredSpan[];
}

/** One run as a numbered list of steps with inputs, outputs and errors. */
export async function getRun(api: ApiClient, runId: string): Promise<string> {
  const { run, spans } = await api.get<RunDetail>(`/v1/runs/${encodeURIComponent(runId)}`);
  const header = [
    `Run ${run.id} (${run.name}) — ${run.status}`,
    `${formatDuration(run.durationMs)}, ${run.stepCount} steps, ${formatTokens(run.tokensIn + run.tokensOut)} tokens, ${formatUsd(run.costUsd)}, models: ${run.models.join(', ') || 'none'}`,
    run.flags.length ? `Flags: ${run.flags.join(', ')}` : null,
    run.replayOfRunId ? `Replay of ${run.replayOfRunId}` : null,
    run.error ? `Error: ${run.error}` : null,
    `Input: ${clip(run.input)}`,
    `Output: ${clip(run.output)}`,
  ];
  const lines = [...header.filter((line): line is string => line !== null), '', 'Steps:'];

  listSteps(spans).forEach((span, index) => {
    const head = `${index}. [${span.kind}] ${span.name}${span.model ? ` (${span.model})` : ''} ${span.status}, ${formatDuration(span.endTime - span.startTime)}`;
    lines.push(head);
    if (span.kind === 'tool')
      lines.push(`   args: ${clip(span.input)}`, `   result: ${clip(span.output)}`);
    else lines.push(`   output: ${clip(span.output)}`);
    if (span.error) lines.push(`   error: ${span.error.message}`);
  });

  return lines.join('\n');
}

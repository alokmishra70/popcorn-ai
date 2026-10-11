import type { SpanError, SpanKind, SpanStatus, TokenUsage } from './span';

export const RUN_STATUSES = ['running', 'ok', 'error'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_FLAGS = ['error', 'loop', 'cost_spike', 'max_steps'] as const;
export type RunFlag = (typeof RUN_FLAGS)[number];

/**
 * A span as read back from storage. Differs from the wire payload in that cost
 * has been computed and times are already resolved.
 */
export interface StoredSpan {
  id: string;
  runId: string;
  parentId: string | null;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  startTime: number;
  endTime: number;
  input?: unknown;
  output?: unknown;
  error?: SpanError | null;
  provider?: string | null;
  model?: string | null;
  usage?: TokenUsage | null;
  costUsd?: number | null;
  attributes?: Record<string, unknown> | null;
}

export interface RunSummary {
  id: string;
  name: string;
  status: RunStatus;
  startedAt: number;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  flags: RunFlag[];
  stepCount: number;
  replayOfRunId: string | null;
}

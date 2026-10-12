import {
  SpanAttr,
  computeCost,
  diffRuns,
  type RunDiff,
  type SpanPayload,
  type StoredSpan,
} from '@popcornai/core';
import { apiRequest } from '../api-client';
import { PopcornError } from '../errors';
import { getRuntime } from '../runtime';
import { findAgent, trace, type AgentFn } from '../tracer';
import { ReplaySession, type ReplayBundle, type ReplayOptions } from './session';

export interface RewindOptions extends ReplayOptions {
  /** The agent to re-run. Defaults to the one registered with `popcorn.agent` under the run's name. */
  agent?: AgentFn<never, unknown>;
  /** Replace the recorded input. */
  input?: unknown;
  /** Supply the bundle directly instead of fetching it from the API. */
  bundle?: ReplayBundle;
}

export interface RewindResult {
  runId: string;
  originalRunId: string;
  output: unknown;
  error: Error | null;
  diff: RunDiff;
}

/**
 * Re-runs a recorded run (FR-3.2). Tools return their recorded outputs, LLM
 * calls before `fromStep` return their recorded responses, and LLM calls from
 * `fromStep` on go live, with any model or prompt overrides applied. The new run
 * is recorded and linked to the original.
 *
 * A failing agent does not throw: the error is returned so the diff can still
 * show where the replay diverged.
 *
 * @example
 * const result = await popcorn.rewind(runId, { fromStep: 3, overrides: { system: newPrompt } });
 * console.log(result.diff.finalOutput);
 */
export async function rewind(runId: string, options: RewindOptions = {}): Promise<RewindResult> {
  const bundle =
    options.bundle ?? (await apiRequest<ReplayBundle>('GET', `/v1/runs/${runId}/replay`));
  // An agent declared with popcorn.agent() carries its raw function; use that to avoid a nested trace.
  const supplied = options.agent as
    (AgentFn<unknown, unknown> & { run?: AgentFn<unknown, unknown> }) | undefined;
  const agentFn = supplied?.run ?? supplied ?? findAgent(bundle.run.name);
  if (!agentFn) {
    throw new PopcornError(
      `No agent registered as "${bundle.run.name}". Declare it with popcorn.agent() or pass { agent }.`,
    );
  }

  const runtime = getRuntime();
  const session = new ReplaySession(bundle, options);
  const input = options.input !== undefined ? options.input : bundle.run.input;
  const captured: SpanPayload[] = [];
  let replayRunId: string | undefined;

  const stopListening = runtime.addSpanListener((span) => {
    if (span.runId === replayRunId) captured.push(span);
  });

  let output: unknown = null;
  let error: Error | null = null;
  try {
    output = await trace(
      bundle.run.name,
      (span) => {
        replayRunId = span.runId;
        return agentFn(input);
      },
      {
        input,
        replay: session,
        attributes: {
          [SpanAttr.ReplayOf]: bundle.run.id,
          [SpanAttr.ReplayFromStep]: session.fromStep,
          ...(options.overrides?.model
            ? { 'popcorn.override.model': options.overrides.model }
            : {}),
          ...(options.overrides?.system !== undefined ? { 'popcorn.override.system': true } : {}),
        },
      },
    );
  } catch (thrown) {
    error = thrown instanceof Error ? thrown : new Error(String(thrown));
  } finally {
    stopListening();
  }

  await runtime.exporter?.flush();

  return {
    runId: replayRunId!,
    originalRunId: bundle.run.id,
    output,
    error,
    diff: diffRuns(bundle.spans, captured.map(toStored)),
  };
}

function toStored(span: SpanPayload): StoredSpan {
  return { ...span, costUsd: span.kind === 'llm' ? computeCost(span.model, span.usage) : null };
}

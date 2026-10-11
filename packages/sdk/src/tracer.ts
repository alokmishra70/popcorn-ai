import { randomUUID } from 'node:crypto';
import type { SpanKind } from '@popcorn-ai/core';
import { activeContext, runInContext, type RunState, type TraceContext } from './context';
import type { ReplaySession } from './replay/session';
import { getRuntime } from './runtime';
import { Span } from './span';

export interface TraceOptions {
  /** The run's input. Recorded on the root span and used as the input when the run is replayed. */
  input?: unknown;
  /** Extra attributes for the span. */
  attributes?: Record<string, unknown>;
  /** Set to false to skip recording the function's return value. */
  captureOutput?: boolean;
  /** @internal Used by `rewind` to run the agent against recorded fixtures. */
  replay?: ReplaySession;
}

/** Creates a span as a child of the active one, or as the root of a new run when there is none. */
export function startSpan(
  kind: SpanKind,
  name: string,
  parent: TraceContext | undefined,
  replay?: ReplaySession,
) {
  const runtime = getRuntime();
  const run: RunState = parent?.run ?? {
    runId: randomUUID(),
    sampled: runtime.shouldSample(),
    replay: replay ?? null,
    steps: 0,
  };
  const span = new Span({
    runId: run.runId,
    parentId: parent?.span.id ?? null,
    kind: parent ? kind : 'agent',
    name,
    onEnd: (payload) => runtime.handleSpanEnd(payload, run.sampled),
  });
  return { span, context: { run, span } satisfies TraceContext };
}

/** Runs `fn` inside `span`, recording its result or error and ending the span either way. */
export async function runInSpan<T>(
  context: TraceContext,
  fn: () => Promise<T> | T,
  captureOutput = true,
): Promise<T> {
  const { span } = context;
  try {
    const result = await runInContext(context, fn);
    if (captureOutput && result !== undefined) span.setOutput(result);
    return result;
  } catch (error) {
    span.recordError(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Records one agent run (FR-1.2). Called outside any trace it starts a new run;
 * called inside one it records a nested `step` span. LLM and tool calls made
 * anywhere inside `fn`, including across `await`, attach to the right parent.
 *
 * @example
 * const answer = await popcorn.trace('support-triage', async () => {
 *   return runAgent(ticket);
 * }, { input: ticket });
 */
export function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options: TraceOptions = {},
): Promise<T> {
  const { span, context } = startSpan('step', name, activeContext(), options.replay);
  if (options.input !== undefined) span.setInput(options.input);
  for (const [key, value] of Object.entries(options.attributes ?? {}))
    span.setAttribute(key, value);
  return runInSpan(context, () => fn(span), options.captureOutput ?? true);
}

export type AgentFn<I, O> = (input: I) => Promise<O> | O;

export interface Agent<I, O> {
  (input: I): Promise<O>;
  readonly agentName: string;
  /** The undecorated function, called by `rewind` and the eval runner inside their own traces. */
  readonly run: AgentFn<I, O>;
}

const registry = new Map<string, AgentFn<unknown, unknown>>();

/**
 * Declares a replayable agent: every call is traced as a run named `name` with
 * its input recorded, and `rewind` can find the function again by that name.
 *
 * @example
 * export const triage = popcorn.agent('support-triage', async (ticket: Ticket) => {
 *   ...
 * });
 */
export function agent<I, O>(name: string, fn: AgentFn<I, O>): Agent<I, O> {
  registry.set(name, fn as AgentFn<unknown, unknown>);
  const traced = (input: I) => trace(name, () => fn(input), { input });
  return Object.assign(traced, { agentName: name, run: fn });
}

export function findAgent(name: string): AgentFn<unknown, unknown> | undefined {
  return registry.get(name);
}

/** The span that is active at the call site, if any. */
export function currentSpan(): Span | undefined {
  return activeContext()?.span;
}

/** The id of the run that is active at the call site, if any. */
export function currentRunId(): string | undefined {
  return activeContext()?.run.runId;
}

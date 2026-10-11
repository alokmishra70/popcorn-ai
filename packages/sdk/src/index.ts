import { dataset } from './dataset';
import { wrapAnthropic } from './instrumentation/anthropic';
import { wrapOpenAI } from './instrumentation/openai';
import { redactors } from './redact';
import { rewind } from './replay/rewind';
import { getRuntime, initRuntime, type PopcornOptions } from './runtime';
import { tool } from './tool';
import { agent, currentRunId, currentSpan, trace } from './tracer';

/**
 * Configures the SDK (FR-1.1). Optional: without it, settings come from
 * `POPCORN_ENDPOINT`, `POPCORN_API_KEY` and friends on first use.
 *
 * @example
 * popcorn.init({ project: 'support-bot', endpoint: 'http://localhost:4100' });
 */
export function init(options: PopcornOptions = {}): void {
  initRuntime(options);
}

/**
 * Sends every buffered span. Call before a short-lived process exits, such as a
 * serverless handler or a script; never rejects.
 */
export async function flush(): Promise<void> {
  await getRuntime().exporter?.flush();
}

/** Flushes and stops the background timer. */
export async function shutdown(): Promise<void> {
  await getRuntime().exporter?.shutdown();
}

/** Calls `listener` with every span as it ends, before redaction. Returns an unsubscribe function. */
export function onSpanEnd(
  listener: Parameters<ReturnType<typeof getRuntime>['addSpanListener']>[0],
): () => void {
  return getRuntime().addSpanListener(listener);
}

export const popcorn = {
  init,
  trace,
  agent,
  tool,
  wrapAnthropic,
  wrapOpenAI,
  rewind,
  dataset,
  flush,
  shutdown,
  onSpanEnd,
  currentSpan,
  currentRunId,
  redactors,
};

export default popcorn;

export {
  trace,
  agent,
  tool,
  wrapAnthropic,
  wrapOpenAI,
  rewind,
  dataset,
  currentSpan,
  currentRunId,
  redactors,
};
export { SpanAttr, type SpanPayload, type CheckInput } from '@popcorn-ai/core';
export type { PopcornOptions } from './runtime';
export type { TraceOptions, Agent, AgentFn } from './tracer';
export type { ToolOptions, ToolCacheOptions } from './tool';
export type { SpanRedactor } from './redact';
export type { RewindOptions, RewindResult } from './replay/rewind';
export type {
  ReplayBundle,
  ReplayOptions,
  ReplayOverrides,
  Fixture,
  FixtureMissPolicy,
} from './replay/session';
export type { AddTestCaseOptions, TestCaseRef } from './dataset';
export type { SpanTransport } from './transport';
export { Span } from './span';
export { PopcornError, PopcornApiError, FixtureMissError, RecordedToolError } from './errors';

import { SpanAttr, type TokenUsage } from '@popcornai/core';
import { activeContext, nextStep } from '../context';
import type { ReplaySession } from '../replay/session';
import type { Span } from '../span';
import { startSpan } from '../tracer';

export type Provider = 'anthropic' | 'openai';

export interface LlmResultView {
  model?: string;
  usage?: TokenUsage;
  stopReason?: string;
}

export interface LlmCallSpec<P extends Record<string, unknown>, R> {
  provider: Provider;
  spanName: string;
  params: P;
  /** Applies replay overrides (model, system prompt) to a live request. */
  applyOverrides: (params: P, session: ReplaySession) => P;
  /** Pulls model, usage and stop reason out of a completed response. */
  describe: (result: R) => LlmResultView;
  /** Records what the span input should be; defaults to the params. */
  recordInput?: (params: P) => unknown;
}

export interface StartedLlmCall<P> {
  span: Span;
  params: P;
  /** Set when replaying a step before `fromStep`: return this instead of calling the API. */
  recorded: unknown;
  finish: (result: unknown, view: LlmResultView) => void;
  fail: (error: unknown) => void;
}

/**
 * Opens an `llm` span for a provider call, or returns null when there is no
 * active run (the call then goes straight through, untraced).
 */
export function startLlmCall<P extends Record<string, unknown>, R>(
  spec: LlmCallSpec<P, R>,
): StartedLlmCall<P> | null {
  const parent = activeContext();
  if (!parent) return null;

  const step = nextStep(parent.run);
  const replay = parent.run.replay;
  const recorded = replay?.recordedLlmResponse(step);
  const params =
    replay && recorded === undefined ? spec.applyOverrides(spec.params, replay) : spec.params;

  const { span } = startSpan('llm', spec.spanName, parent);
  span.setModel(spec.provider, typeof params.model === 'string' ? params.model : undefined);
  span.setInput(spec.recordInput ? spec.recordInput(params) : params);
  if (recorded !== undefined) span.setAttribute(SpanAttr.Fixture, 'hit');

  return {
    span,
    params,
    recorded,
    finish(result, view) {
      span.setOutput(result);
      span.setModel(spec.provider, view.model);
      if (view.usage) span.setUsage(view.usage);
      if (view.stopReason) span.setAttribute(SpanAttr.StopReason, view.stopReason);
      span.end();
    },
    fail(error) {
      span.recordError(error);
      span.end();
    },
  };
}

/**
 * Wraps a provider stream so the span ends when the caller finishes iterating,
 * stops early, or the stream throws. Every other property (`controller`, `tee`,
 * ...) is passed through.
 */
export function instrumentStream<S extends object, E>(
  stream: S,
  onEvent: (event: E) => void,
  onDone: () => void,
  onError: (error: unknown) => void,
): S {
  let settled = false;
  const settle = (error?: unknown) => {
    if (settled) return;
    settled = true;
    if (error === undefined) onDone();
    else onError(error);
  };

  return new Proxy(stream, {
    get(target, prop, receiver) {
      if (prop !== Symbol.asyncIterator) return Reflect.get(target, prop, receiver);
      return () => {
        const iterator = (target as unknown as AsyncIterable<E>)[Symbol.asyncIterator]();
        return {
          async next() {
            try {
              const result = await iterator.next();
              if (result.done) settle();
              else onEvent(result.value);
              return result;
            } catch (error) {
              settle(error);
              throw error;
            }
          },
          async return(value?: unknown) {
            settle();
            return iterator.return ? iterator.return(value) : { done: true as const, value };
          },
          async throw(error?: unknown) {
            settle(error);
            if (iterator.throw) return iterator.throw(error);
            throw error;
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      };
    },
  });
}

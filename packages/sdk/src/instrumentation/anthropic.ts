import { SpanAttr, type TokenUsage } from '@popcorn-ai/core';
import type { ReplaySession } from '../replay/session';
import { instrumentStream, startLlmCall, type LlmResultView } from './llm-call';
import { patchMethods, type MethodPatch } from './proxy';

/*
 * Structural types for the parts of the Anthropic SDK we touch. Keeping them
 * local means @anthropic-ai/sdk is not a dependency of the SDK.
 */
interface AnthropicUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface AnthropicMessage {
  id?: string;
  model?: string;
  role?: string;
  content?: Array<Record<string, unknown>>;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
}

type AnthropicStreamEvent =
  | { type: 'message_start'; message: AnthropicMessage }
  | { type: 'content_block_start'; index: number; content_block: Record<string, unknown> }
  | { type: 'content_block_delta'; index: number; delta: Record<string, unknown> }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string | null }; usage?: AnthropicUsage }
  | { type: 'message_stop' };

interface MessageStreamLike {
  on(event: 'finalMessage', listener: (message: AnthropicMessage) => void): unknown;
  on(event: 'error' | 'abort', listener: (error: unknown) => void): unknown;
}

type Params = Record<string, unknown> & { model?: string; stream?: boolean; system?: unknown };

const PROVIDER = 'anthropic';
const SPAN_NAME = 'anthropic.messages';

function toUsage(usage: AnthropicUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    ...(usage.cache_read_input_tokens ? { cacheReadTokens: usage.cache_read_input_tokens } : {}),
    ...(usage.cache_creation_input_tokens
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
  };
}

const describe = (message: AnthropicMessage): LlmResultView => ({
  model: message.model,
  usage: toUsage(message.usage),
  stopReason: message.stop_reason ?? undefined,
});

function applyOverrides(params: Params, session: ReplaySession): Params {
  const { model, system, params: edit } = session.overrides;
  let next: Params = { ...params };
  if (model) next.model = model;
  if (system !== undefined) next.system = system;
  if (edit) next = edit(next, PROVIDER) as Params;
  return next;
}

/** Rebuilds the final message from stream events, the same shape `create` returns. */
class MessageAccumulator {
  private message: AnthropicMessage = { content: [] };
  private readonly partialJson = new Map<number, string>();

  add(event: AnthropicStreamEvent): void {
    switch (event.type) {
      case 'message_start':
        this.message = { ...event.message, content: [] };
        break;
      case 'content_block_start':
        this.message.content![event.index] = { ...event.content_block };
        break;
      case 'content_block_delta': {
        const block = this.message.content![event.index];
        if (!block) break;
        const delta = event.delta;
        if (delta.type === 'text_delta') block.text = `${block.text ?? ''}${delta.text as string}`;
        if (delta.type === 'thinking_delta')
          block.thinking = `${block.thinking ?? ''}${delta.thinking as string}`;
        if (delta.type === 'input_json_delta') {
          this.partialJson.set(
            event.index,
            (this.partialJson.get(event.index) ?? '') + (delta.partial_json as string),
          );
        }
        break;
      }
      case 'content_block_stop': {
        const json = this.partialJson.get(event.index);
        const block = this.message.content![event.index];
        if (json !== undefined && block) {
          try {
            block.input = JSON.parse(json);
          } catch {
            block.input = json;
          }
        }
        break;
      }
      case 'message_delta':
        if (event.delta.stop_reason) this.message.stop_reason = event.delta.stop_reason;
        if (event.usage) this.message.usage = { ...this.message.usage, ...stripNulls(event.usage) };
        break;
    }
  }

  get result(): AnthropicMessage {
    return this.message;
  }
}

function stripNulls(usage: AnthropicUsage): AnthropicUsage {
  return Object.fromEntries(Object.entries(usage).filter(([, v]) => v !== null && v !== undefined));
}

const createPatch: MethodPatch = (original) =>
  function create(...args: unknown[]) {
    const [params, ...rest] = args as [Params, ...unknown[]];
    const call = startLlmCall<Params, AnthropicMessage>({
      provider: PROVIDER,
      spanName: SPAN_NAME,
      params,
      applyOverrides,
      describe,
    });
    if (!call) return original(...args);

    if (call.recorded !== undefined) {
      call.finish(call.recorded, describe(call.recorded as AnthropicMessage));
      return Promise.resolve(call.recorded);
    }

    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(original(call.params, ...rest));
    } catch (error) {
      call.fail(error);
      throw error;
    }

    return pending.then(
      (result) => {
        if (!call.params.stream) {
          call.finish(result, describe(result as AnthropicMessage));
          return result;
        }
        call.span.setAttribute(SpanAttr.Streamed, true);
        const accumulator = new MessageAccumulator();
        return instrumentStream<object, AnthropicStreamEvent>(
          result as object,
          (event) => accumulator.add(event),
          () => call.finish(accumulator.result, describe(accumulator.result)),
          (error) => call.fail(error),
        );
      },
      (error: unknown) => {
        call.fail(error);
        throw error;
      },
    );
  };

const streamPatch: MethodPatch = (original) =>
  function stream(...args: unknown[]) {
    const [params, ...rest] = args as [Params, ...unknown[]];
    const call = startLlmCall<Params, AnthropicMessage>({
      provider: PROVIDER,
      spanName: SPAN_NAME,
      params,
      applyOverrides,
      describe,
    });
    if (!call) return original(...args);

    // Recorded responses can't be replayed through the stream helper; it always goes live.
    call.span.setAttribute(SpanAttr.Streamed, true);
    const messageStream = original(call.params, ...rest) as MessageStreamLike;
    messageStream.on('finalMessage', (message) => call.finish(message, describe(message)));
    messageStream.on('error', (error) => call.fail(error));
    messageStream.on('abort', (error) => call.fail(error));
    return messageStream;
  };

/**
 * Returns an instrumented view of an Anthropic client (FR-1.3). Calls to
 * `messages.create` and `messages.stream`, including their `beta` variants, made
 * inside a trace are recorded as `llm` spans with model, messages, tokens,
 * latency and errors. Outside a trace they pass straight through.
 *
 * @example
 * const anthropic = popcorn.wrapAnthropic(new Anthropic());
 */
export function wrapAnthropic<T extends object>(client: T): T {
  return patchMethods(client, {
    'messages.create': createPatch,
    'messages.stream': streamPatch,
    'beta.messages.create': createPatch,
    'beta.messages.stream': streamPatch,
  });
}

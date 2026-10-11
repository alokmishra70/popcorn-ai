import { SpanAttr, type TokenUsage } from '@popcorn-ai/core';
import type { ReplaySession } from '../replay/session';
import { instrumentStream, startLlmCall, type LlmResultView } from './llm-call';
import { patchMethods, type MethodPatch } from './proxy';

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number } | null;
}

interface ChatCompletion {
  model?: string;
  choices?: Array<{
    index?: number;
    message?: Record<string, unknown>;
    finish_reason?: string | null;
  }>;
  usage?: ChatUsage | null;
}

interface ChatCompletionChunk {
  model?: string;
  choices?: Array<{
    index: number;
    delta?: { role?: string; content?: string | null; tool_calls?: ToolCallDelta[] };
    finish_reason?: string | null;
  }>;
  usage?: ChatUsage | null;
}

interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface ResponsesResult {
  model?: string;
  status?: string;
  usage?: ResponsesUsage | null;
}

type Params = Record<string, unknown> & { model?: string; stream?: boolean };
type ChatMessage = { role: string; content?: unknown };

const PROVIDER = 'openai';

// OpenAI reports cached tokens as part of the prompt count; split them so cost uses the cached rate.
function splitCached(
  total: number | undefined,
  cached: number | undefined,
): Pick<TokenUsage, 'inputTokens' | 'cacheReadTokens'> {
  const cachedTokens = cached ?? 0;
  return {
    inputTokens: Math.max(0, (total ?? 0) - cachedTokens),
    ...(cachedTokens ? { cacheReadTokens: cachedTokens } : {}),
  };
}

const chatUsage = (usage: ChatUsage | null | undefined): TokenUsage | undefined =>
  usage
    ? {
        ...splitCached(usage.prompt_tokens, usage.prompt_tokens_details?.cached_tokens),
        outputTokens: usage.completion_tokens ?? 0,
      }
    : undefined;

const describeChat = (completion: ChatCompletion): LlmResultView => ({
  model: completion.model,
  usage: chatUsage(completion.usage),
  stopReason: completion.choices?.[0]?.finish_reason ?? undefined,
});

const describeResponse = (response: ResponsesResult): LlmResultView => ({
  model: response.model,
  usage: response.usage
    ? {
        ...splitCached(
          response.usage.input_tokens,
          response.usage.input_tokens_details?.cached_tokens,
        ),
        outputTokens: response.usage.output_tokens ?? 0,
      }
    : undefined,
  stopReason: response.status,
});

function overrideChat(params: Params, session: ReplaySession): Params {
  const { model, system, params: edit } = session.overrides;
  let next: Params = { ...params };
  if (model) next.model = model;
  if (system !== undefined && Array.isArray(params.messages)) {
    const messages = (params.messages as ChatMessage[]).filter(
      (m) => m.role !== 'system' && m.role !== 'developer',
    );
    next.messages = [{ role: 'system', content: system }, ...messages];
  }
  if (edit) next = edit(next, PROVIDER) as Params;
  return next;
}

function overrideResponses(params: Params, session: ReplaySession): Params {
  const { model, system, params: edit } = session.overrides;
  let next: Params = { ...params };
  if (model) next.model = model;
  if (system !== undefined) next.instructions = system;
  if (edit) next = edit(next, PROVIDER) as Params;
  return next;
}

/** Rebuilds a chat completion from stream chunks. */
class ChatAccumulator {
  private model: string | undefined;
  private usage: ChatUsage | null = null;
  private readonly choices = new Map<
    number,
    {
      content: string;
      role: string;
      finish_reason: string | null;
      tool_calls: Map<number, ToolCallDelta>;
    }
  >();

  add(chunk: ChatCompletionChunk): void {
    this.model ??= chunk.model;
    if (chunk.usage) this.usage = chunk.usage;
    for (const choice of chunk.choices ?? []) {
      const state = this.choices.get(choice.index) ?? {
        content: '',
        role: 'assistant',
        finish_reason: null,
        tool_calls: new Map(),
      };
      if (choice.delta?.role) state.role = choice.delta.role;
      if (choice.delta?.content) state.content += choice.delta.content;
      for (const call of choice.delta?.tool_calls ?? []) {
        const existing = state.tool_calls.get(call.index);
        state.tool_calls.set(call.index, {
          index: call.index,
          id: existing?.id ?? call.id,
          type: existing?.type ?? call.type,
          function: {
            name: (existing?.function?.name ?? '') + (call.function?.name ?? ''),
            arguments: (existing?.function?.arguments ?? '') + (call.function?.arguments ?? ''),
          },
        });
      }
      if (choice.finish_reason) state.finish_reason = choice.finish_reason;
      this.choices.set(choice.index, state);
    }
  }

  get result(): ChatCompletion {
    return {
      model: this.model,
      usage: this.usage,
      choices: [...this.choices.entries()].map(([index, state]) => ({
        index,
        finish_reason: state.finish_reason,
        message: {
          role: state.role,
          content: state.content || null,
          ...(state.tool_calls.size
            ? {
                tool_calls: [...state.tool_calls.values()].map(
                  ({ index: _index, ...call }) => call,
                ),
              }
            : {}),
        },
      })),
    };
  }
}

function makePatch<R extends object>(
  spanName: string,
  applyOverrides: (params: Params, session: ReplaySession) => Params,
  describe: (result: R) => LlmResultView,
  isChat: boolean,
): MethodPatch {
  return (original) =>
    function create(...args: unknown[]) {
      const [params, ...rest] = args as [Params, ...unknown[]];
      const call = startLlmCall<Params, R>({
        provider: PROVIDER,
        spanName,
        params,
        applyOverrides,
        describe,
      });
      if (!call) return original(...args);

      if (call.recorded !== undefined) {
        call.finish(call.recorded, describe(call.recorded as R));
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
            call.finish(result, describe(result as R));
            return result;
          }
          call.span.setAttribute(SpanAttr.Streamed, true);
          if (!isChat) {
            // Responses API streams carry a final `response.completed` event with the full object.
            let final: R | undefined;
            return instrumentStream<object, { type?: string; response?: R }>(
              result as object,
              (event) => {
                if (event.type === 'response.completed' && event.response) final = event.response;
              },
              () => call.finish(final ?? null, final ? describe(final) : {}),
              (error) => call.fail(error),
            );
          }
          const accumulator = new ChatAccumulator();
          return instrumentStream<object, ChatCompletionChunk>(
            result as object,
            (chunk) => accumulator.add(chunk),
            () => call.finish(accumulator.result, describeChat(accumulator.result)),
            (error) => call.fail(error),
          );
        },
        (error: unknown) => {
          call.fail(error);
          throw error;
        },
      );
    };
}

/**
 * Returns an instrumented view of an OpenAI client (FR-1.3). Records
 * `chat.completions.create` and `responses.create`, streaming or not.
 *
 * Streaming chat completions only report token usage when the request sets
 * `stream_options: { include_usage: true }`; without it the span has no cost.
 *
 * @example
 * const openai = popcorn.wrapOpenAI(new OpenAI());
 */
export function wrapOpenAI<T extends object>(client: T): T {
  return patchMethods(client, {
    'chat.completions.create': makePatch<ChatCompletion>(
      'openai.chat',
      overrideChat,
      describeChat,
      true,
    ),
    'responses.create': makePatch<ResponsesResult>(
      'openai.responses',
      overrideResponses,
      describeResponse,
      false,
    ),
  });
}

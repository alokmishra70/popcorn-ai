import { SpanAttr } from '@popcornai/core';
import { hashArgs } from '@popcornai/core/node';
import { TtlCache } from './cache';
import { activeContext, nextStep } from './context';
import { FixtureMissError, RecordedToolError } from './errors';
import { runInSpan, startSpan } from './tracer';

export interface ToolCacheOptions {
  /** How long a cached result stays valid. */
  ttlMs: number;
  /** Entries kept per tool. Default 500. */
  maxEntries?: number;
}

export interface ToolOptions {
  /**
   * Cache results in memory, keyed by arguments (FR-3.6). Only for tools that are
   * deterministic for the TTL, such as lookups; never for tools with side effects.
   */
  cache?: ToolCacheOptions;
}

/**
 * Wraps a tool function so each call is recorded as a `tool` span with its
 * arguments, result, duration and any thrown error (FR-1.4). During a replay the
 * wrapper returns the recorded result instead of calling `fn`.
 *
 * A single argument is recorded as-is; several are recorded as an array.
 *
 * @example
 * const lookupOrder = popcorn.tool('lookup_order', async ({ orderId }: { orderId: string }) => {
 *   return orders.get(orderId);
 * });
 */
export function tool<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R> | R,
  options: ToolOptions = {},
): (...args: A) => Promise<R> {
  const cache = options.cache
    ? new TtlCache<R>(options.cache.ttlMs, options.cache.maxEntries ?? 500)
    : null;

  return async function tracedTool(this: unknown, ...args: A): Promise<R> {
    const parent = activeContext();
    if (!parent) return fn.apply(this, args);

    const input = args.length === 1 ? args[0] : args;
    const argsHash = hashArgs(name, input);
    nextStep(parent.run);
    const { span, context } = startSpan('tool', name, parent);
    span.setInput(input).setAttribute(SpanAttr.ArgsHash, argsHash);

    return runInSpan(context, async () => {
      const replay = parent.run.replay;
      if (replay) {
        const fixture = replay.takeFixture(name, argsHash);
        if (fixture) {
          span.setAttribute(SpanAttr.Fixture, 'hit');
          if (fixture.isError) throw new RecordedToolError(errorMessage(fixture.result));
          return fixture.result as R;
        }
        span.setAttribute(SpanAttr.Fixture, 'miss');
        if (replay.onFixtureMiss === 'fail') throw new FixtureMissError(name, argsHash);
      }

      if (cache && !replay) {
        const cached = cache.get(argsHash);
        span.setAttribute(SpanAttr.Cache, cached === undefined ? 'miss' : 'hit');
        if (cached !== undefined) return cached;
      }

      const result = await fn.apply(this, args);
      cache?.set(argsHash, result);
      return result;
    });
  };
}

function errorMessage(recorded: unknown): string {
  if (recorded && typeof recorded === 'object' && 'message' in recorded) {
    return String((recorded as { message: unknown }).message);
  }
  return typeof recorded === 'string' ? recorded : 'tool failed in the recorded run';
}

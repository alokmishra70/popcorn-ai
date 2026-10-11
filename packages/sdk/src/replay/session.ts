import { listSteps, type StoredSpan } from '@popcorn-ai/core';

export interface Fixture {
  toolName: string;
  argsHash: string;
  result: unknown;
  isError: boolean;
}

export interface ReplayBundle {
  run: { id: string; name: string; input: unknown };
  spans: StoredSpan[];
  fixtures: Fixture[];
}

export type FixtureMissPolicy = 'live' | 'fail';

export interface ReplayOverrides {
  /** Use this model for live LLM calls. */
  model?: string;
  /** Replace the system prompt of live LLM calls. */
  system?: string;
  /** Last-resort hook to edit any request before it is sent. Receives provider-specific params. */
  params?: (
    params: Record<string, unknown>,
    provider: 'anthropic' | 'openai',
  ) => Record<string, unknown>;
}

export interface ReplayOptions {
  /** LLM calls before this step index return their recorded response. Default 0: every LLM call is live. */
  fromStep?: number;
  overrides?: ReplayOverrides;
  /** What to do when a tool is called with arguments that were never recorded. Default 'fail'. */
  onFixtureMiss?: FixtureMissPolicy;
}

/**
 * Holds what a replay needs while the agent re-runs: the recorded tool outputs
 * keyed by name and args hash, and the original steps so LLM calls before
 * `fromStep` can return exactly what they returned the first time.
 */
export class ReplaySession {
  readonly fromStep: number;
  readonly overrides: ReplayOverrides;
  readonly onFixtureMiss: FixtureMissPolicy;
  private readonly fixtures = new Map<string, Fixture[]>();
  private readonly originalSteps: StoredSpan[];

  constructor(
    readonly bundle: ReplayBundle,
    options: ReplayOptions = {},
  ) {
    this.fromStep = Math.max(0, options.fromStep ?? 0);
    this.overrides = options.overrides ?? {};
    this.onFixtureMiss = options.onFixtureMiss ?? 'fail';
    this.originalSteps = listSteps(bundle.spans);
    for (const fixture of bundle.fixtures) {
      const key = fixtureKey(fixture.toolName, fixture.argsHash);
      const list = this.fixtures.get(key) ?? [];
      list.push(fixture);
      this.fixtures.set(key, list);
    }
  }

  /**
   * Recorded result for a tool call. When the same call was made more than once
   * in the original run, results are handed out in the original order and the
   * last one repeats.
   */
  takeFixture(toolName: string, argsHash: string): Fixture | undefined {
    const list = this.fixtures.get(fixtureKey(toolName, argsHash));
    if (!list || list.length === 0) return undefined;
    return list.length > 1 ? list.shift() : list[0];
  }

  /** The original response for an LLM call at `step`, if that step is before `fromStep`. */
  recordedLlmResponse(step: number): unknown {
    if (step >= this.fromStep) return undefined;
    const original = this.originalSteps[step];
    return original?.kind === 'llm' && original.status === 'ok' ? original.output : undefined;
  }
}

const fixtureKey = (toolName: string, argsHash: string) => `${toolName}\u0000${argsHash}`;

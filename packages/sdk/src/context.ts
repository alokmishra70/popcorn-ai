import { AsyncLocalStorage } from 'node:async_hooks';
import type { ReplaySession } from './replay/session';
import type { Span } from './span';

/** State shared by every span in one run. */
export interface RunState {
  readonly runId: string;
  readonly sampled: boolean;
  readonly replay: ReplaySession | null;
  /** Count of LLM and tool spans started so far; the next step's index. */
  steps: number;
}

export interface TraceContext {
  readonly run: RunState;
  readonly span: Span;
}

const storage = new AsyncLocalStorage<TraceContext>();

export function activeContext(): TraceContext | undefined {
  return storage.getStore();
}

export function runInContext<T>(context: TraceContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Reserves the next step index in the current run. Steps are LLM and tool calls. */
export function nextStep(run: RunState): number {
  return run.steps++;
}

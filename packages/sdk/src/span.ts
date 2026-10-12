import { randomUUID } from 'node:crypto';
import type { SpanError, SpanKind, SpanPayload, SpanStatus, TokenUsage } from '@popcornai/core';
import { now } from './clock';

export type SpanEndHandler = (payload: SpanPayload) => void;

export interface SpanInit {
  runId: string;
  parentId: string | null;
  kind: SpanKind;
  name: string;
  onEnd: SpanEndHandler;
}

/**
 * A unit of work inside a run. Created by `trace`, `tool` and the LLM client
 * wrappers; user code reaches the active one through `popcorn.currentSpan()`.
 */
export class Span {
  readonly id = randomUUID();
  readonly runId: string;
  readonly parentId: string | null;
  readonly kind: SpanKind;
  readonly name: string;
  readonly startTime = now();

  private input: unknown;
  private output: unknown;
  private error: SpanError | undefined;
  private provider: string | undefined;
  private model: string | undefined;
  private usage: TokenUsage | undefined;
  private attributes: Record<string, unknown> | undefined;
  private status: SpanStatus = 'ok';
  private ended = false;
  private readonly onEnd: SpanEndHandler;

  constructor(init: SpanInit) {
    this.runId = init.runId;
    this.parentId = init.parentId;
    this.kind = init.kind;
    this.name = init.name;
    this.onEnd = init.onEnd;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  setInput(input: unknown): this {
    this.input = input;
    return this;
  }

  setOutput(output: unknown): this {
    this.output = output;
    return this;
  }

  setModel(provider: string, model: string | undefined): this {
    this.provider = provider;
    if (model) this.model = model;
    return this;
  }

  setUsage(usage: TokenUsage): this {
    this.usage = usage;
    return this;
  }

  setAttribute(key: string, value: unknown): this {
    (this.attributes ??= {})[key] = value;
    return this;
  }

  getAttribute(key: string): unknown {
    return this.attributes?.[key];
  }

  recordError(error: unknown): this {
    this.status = 'error';
    this.error = toSpanError(error);
    return this;
  }

  /** Ends the span and hands it to the exporter. Calling it twice is a no-op. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd(this.toPayload(now()));
  }

  private toPayload(endTime: number): SpanPayload {
    const payload: SpanPayload = {
      id: this.id,
      runId: this.runId,
      parentId: this.parentId,
      kind: this.kind,
      name: this.name,
      startTime: this.startTime,
      endTime: Math.max(endTime, this.startTime),
      status: this.status,
    };
    if (this.input !== undefined) payload.input = toJsonSafe(this.input);
    if (this.output !== undefined) payload.output = toJsonSafe(this.output);
    if (this.error) payload.error = this.error;
    if (this.provider) payload.provider = this.provider;
    if (this.model) payload.model = this.model;
    if (this.usage) payload.usage = this.usage;
    if (this.attributes)
      payload.attributes = toJsonSafe(this.attributes) as Record<string, unknown>;
    return payload;
  }
}

export function toSpanError(error: unknown): SpanError {
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status;
    return {
      message: error.message || String(error),
      type: typeof status === 'number' ? `${error.name} (${status})` : error.name,
      ...(error.stack ? { stack: error.stack.slice(0, 20_000) } : {}),
    };
  }
  return { message: typeof error === 'string' ? error : safeStringify(error) };
}

const MAX_STRING = 100_000;

/**
 * Makes a value safe to serialize: drops functions, breaks cycles, converts
 * Errors, Maps, Sets and BigInts, and caps very long strings so one huge
 * payload can't stall the exporter.
 */
export function toJsonSafe(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value ?? null;
  switch (typeof value) {
    case 'string':
      return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}... [truncated]` : value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return undefined;
  }

  const object = value as object;
  if (seen.has(object)) return '[Circular]';
  seen.add(object);
  try {
    if (object instanceof Date) return object.toISOString();
    if (object instanceof Error) return toSpanError(object);
    if (object instanceof Map) return toJsonSafe(Object.fromEntries(object), seen);
    if (object instanceof Set) return toJsonSafe([...object], seen);
    if (ArrayBuffer.isView(object))
      return `[${object.constructor.name} ${object.byteLength} bytes]`;
    if (Array.isArray(object)) return object.map((item) => toJsonSafe(item, seen) ?? null);

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(object)) {
      const safe = toJsonSafe(entry, seen);
      if (safe !== undefined) out[key] = safe;
    }
    return out;
  } finally {
    seen.delete(object);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(toJsonSafe(value));
  } catch {
    return String(value);
  }
}

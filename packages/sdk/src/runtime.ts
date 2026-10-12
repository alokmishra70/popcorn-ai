import type { SpanPayload } from '@popcornai/core';
import { BatchExporter } from './exporter';
import { createLogger, type Logger } from './logger';
import { redactors, stripSecrets, type SpanRedactor } from './redact';
import { HttpTransport, type SpanTransport } from './transport';

export interface PopcornOptions {
  /** Project slug. Informational; the API key decides which project spans land in. */
  project?: string;
  /** Base URL of the Popcorn API. Defaults to `POPCORN_ENDPOINT` or http://localhost:4100. */
  endpoint?: string;
  /** Project API key. Defaults to `POPCORN_API_KEY`. */
  apiKey?: string;
  /** Turn tracing off without removing instrumentation. Defaults to true unless `POPCORN_ENABLED=false`. */
  enabled?: boolean;
  /** Fraction of runs to export, 0 to 1. Unsampled runs still execute normally. Default 1. */
  sampleRate?: number;
  /** Spans per request. Default 100. */
  batchSize?: number;
  /** How often buffered spans are sent. Default 2000 ms. */
  flushIntervalMs?: number;
  /** Spans held in memory while the server is unreachable; the oldest are dropped past this. Default 10,000. */
  maxQueueSize?: number;
  /** Runs on every span before export. Secrets under auth-like keys are always stripped first. */
  redact?: SpanRedactor | SpanRedactor[];
  /** Replace the HTTP transport, e.g. in tests. */
  transport?: SpanTransport;
  /** Log exporter activity to stderr. */
  debug?: boolean;
}

export type SpanListener = (span: SpanPayload) => void;

export interface ApiConfig {
  endpoint: string;
  apiKey: string | undefined;
}

const DEFAULT_ENDPOINT = 'http://localhost:4100';

export class Runtime {
  readonly enabled: boolean;
  readonly sampleRate: number;
  readonly logger: Logger;
  readonly api: ApiConfig;
  readonly exporter: BatchExporter | null;
  private readonly redact: SpanRedactor;
  private readonly listeners = new Set<SpanListener>();

  constructor(options: PopcornOptions = {}) {
    const env = process.env;
    this.enabled = options.enabled ?? env.POPCORN_ENABLED !== 'false';
    this.sampleRate = clamp(options.sampleRate ?? Number(env.POPCORN_SAMPLE_RATE ?? 1));
    this.logger = createLogger(options.debug ?? env.POPCORN_DEBUG === 'true');
    this.api = {
      endpoint: options.endpoint ?? env.POPCORN_ENDPOINT ?? DEFAULT_ENDPOINT,
      apiKey: options.apiKey ?? env.POPCORN_API_KEY,
    };

    const userRedactors = Array.isArray(options.redact)
      ? options.redact
      : options.redact
        ? [options.redact]
        : [];
    this.redact = redactors.compose(stripSecrets, ...userRedactors);

    if (!this.enabled) {
      this.exporter = null;
      return;
    }
    if (!this.api.apiKey && !options.transport) {
      this.logger.warn('no API key set (POPCORN_API_KEY); the ingest API will reject spans');
    }
    this.exporter = new BatchExporter(
      options.transport ??
        new HttpTransport({ endpoint: this.api.endpoint, apiKey: this.api.apiKey }),
      {
        batchSize: options.batchSize ?? 100,
        flushIntervalMs: options.flushIntervalMs ?? 2000,
        maxQueueSize: options.maxQueueSize ?? 10_000,
        logger: this.logger,
      },
    );
  }

  shouldSample(): boolean {
    return this.enabled && (this.sampleRate >= 1 || Math.random() < this.sampleRate);
  }

  /** Called when any span ends. Listeners see every span, sampled or not, before redaction. */
  handleSpanEnd(span: SpanPayload, sampled: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(span);
      } catch (error) {
        this.logger.warn('span listener threw', error);
      }
    }
    if (!sampled || !this.exporter) return;

    let redacted: SpanPayload | null;
    try {
      redacted = this.redact(span);
    } catch (error) {
      // A broken redactor must never leak unredacted data; drop the span instead.
      this.logger.warn(`redact hook threw, dropping span ${span.name}`, error);
      return;
    }
    if (redacted) this.exporter.enqueue(redacted);
  }

  addSpanListener(listener: SpanListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function clamp(rate: number): number {
  return Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 1;
}

let current: Runtime | null = null;
let exitHookInstalled = false;

export function initRuntime(options: PopcornOptions): Runtime {
  const previous = current;
  current = new Runtime(options);
  if (previous?.exporter) void previous.exporter.shutdown();

  if (!exitHookInstalled) {
    exitHookInstalled = true;
    // beforeExit fires when the event loop drains, which is when short scripts lose spans.
    process.once('beforeExit', () => void current?.exporter?.flush());
  }
  return current;
}

/** The active runtime, created from environment variables on first use if `init` was never called. */
export function getRuntime(): Runtime {
  return current ?? initRuntime({});
}

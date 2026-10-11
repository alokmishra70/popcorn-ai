import type { SpanPayload } from '@popcorn-ai/core';
import { throttle, type Logger } from './logger';
import { TransportError, type SpanTransport } from './transport';

export interface ExporterOptions {
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  logger: Logger;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Buffers finished spans and ships them in batches (FR-1.5). Nothing here ever
 * throws into the caller: a down server means spans wait in memory, and once the
 * buffer is full the oldest are dropped with a warning.
 */
export class BatchExporter {
  private queue: SpanPayload[] = [];
  private inFlight: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private retryAt = 0;
  private dropped = 0;
  private readonly timer: NodeJS.Timeout;
  private readonly warn: (key: string, message: string) => void;

  constructor(
    private readonly transport: SpanTransport,
    private readonly options: ExporterOptions,
  ) {
    this.warn = throttle(options.logger, 10_000);
    this.timer = setInterval(() => void this.drain(false), options.flushIntervalMs);
    this.timer.unref();
  }

  get pending(): number {
    return this.queue.length;
  }

  enqueue(span: SpanPayload): void {
    this.queue.push(span);
    if (this.queue.length > this.options.maxQueueSize) {
      const overflow = this.queue.length - this.options.maxQueueSize;
      this.queue.splice(0, overflow);
      this.dropped += overflow;
      this.warn(
        'overflow',
        `span buffer full (${this.options.maxQueueSize}); dropped ${this.dropped} oldest span(s) so far`,
      );
    }
    if (this.queue.length >= this.options.batchSize && !this.inFlight) {
      setImmediate(() => void this.drain(false));
    }
  }

  /** Sends everything buffered, ignoring any retry backoff. Resolves even if sending fails. */
  async flush(): Promise<void> {
    await this.drain(true);
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  private drain(force: boolean): Promise<void> {
    if (this.inFlight) {
      return force ? this.inFlight.then(() => this.drain(true)) : this.inFlight;
    }
    if (this.queue.length === 0) return Promise.resolve();
    if (!force && Date.now() < this.retryAt) return Promise.resolve();

    this.inFlight = this.sendAll().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async sendAll(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.options.batchSize);
      try {
        await this.transport.send(batch);
        this.consecutiveFailures = 0;
        this.retryAt = 0;
      } catch (error) {
        if (error instanceof TransportError && !error.retryable) {
          this.warn('rejected', `dropped ${batch.length} span(s): ${error.message}`);
          continue;
        }
        // Put the batch back in front and wait before trying again.
        this.queue.unshift(...batch);
        this.consecutiveFailures += 1;
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.consecutiveFailures - 1));
        this.retryAt = Date.now() + backoff;
        this.warn(
          'unreachable',
          `export failed, retrying in ${backoff / 1000}s (${this.queue.length} span(s) buffered): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
    }
  }
}

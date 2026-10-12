import type { SpanPayload } from '@popcornai/core';
import { popcorn, type PopcornOptions, type SpanTransport } from '../src';

export class MemoryTransport implements SpanTransport {
  readonly batches: SpanPayload[][] = [];
  failNext = 0;

  async send(spans: SpanPayload[]): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('connection refused');
    }
    this.batches.push(spans);
  }

  get spans(): SpanPayload[] {
    return this.batches.flat();
  }
}

/** Initializes the SDK against an in-memory transport and returns it. */
export function setup(options: PopcornOptions = {}): MemoryTransport {
  const transport = new MemoryTransport();
  popcorn.init({ transport, flushIntervalMs: 60_000, ...options });
  return transport;
}

export async function collect(transport: MemoryTransport): Promise<SpanPayload[]> {
  await popcorn.flush();
  return transport.spans;
}

export const byName = (spans: SpanPayload[], name: string) => spans.filter((s) => s.name === name);

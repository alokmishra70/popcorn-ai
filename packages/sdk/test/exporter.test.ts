import type { SpanPayload } from '@popcorn-ai/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchExporter } from '../src/exporter';
import { createLogger } from '../src/logger';
import { TransportError } from '../src/transport';
import { MemoryTransport } from './helpers';

const span = (i: number) => ({ id: String(i) }) as unknown as SpanPayload;

function exporter(
  transport: MemoryTransport,
  overrides: Partial<ConstructorParameters<typeof BatchExporter>[1]> = {},
) {
  return new BatchExporter(transport, {
    batchSize: 3,
    flushIntervalMs: 60_000,
    maxQueueSize: 10,
    logger: createLogger(false),
    ...overrides,
  });
}

afterEach(() => vi.restoreAllMocks());

describe('BatchExporter', () => {
  it('sends in batches of batchSize', async () => {
    const transport = new MemoryTransport();
    const e = exporter(transport);
    for (let i = 0; i < 7; i++) e.enqueue(span(i));
    await e.flush();
    expect(transport.batches.map((b) => b.length)).toEqual([3, 3, 1]);
    await e.shutdown();
  });

  it('keeps spans buffered when the server is down and delivers them later', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = new MemoryTransport();
    transport.failNext = 1;
    const e = exporter(transport);
    e.enqueue(span(1));
    await e.flush();
    expect(transport.spans).toHaveLength(0);
    expect(e.pending).toBe(1);

    await e.flush();
    expect(transport.spans.map((s) => s.id)).toEqual(['1']);
    await e.shutdown();
  });

  it('drops the oldest spans past maxQueueSize', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = new MemoryTransport();
    const e = exporter(transport, { batchSize: 100, maxQueueSize: 5 });
    for (let i = 0; i < 8; i++) e.enqueue(span(i));
    await e.flush();
    expect(transport.spans.map((s) => s.id)).toEqual(['3', '4', '5', '6', '7']);
    await e.shutdown();
  });

  it('drops batches the server rejects as invalid instead of retrying forever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = { send: vi.fn().mockRejectedValue(new TransportError('400', false)) };
    const e = new BatchExporter(transport, {
      batchSize: 10,
      flushIntervalMs: 60_000,
      maxQueueSize: 10,
      logger: createLogger(false),
    });
    e.enqueue(span(1));
    await e.flush();
    expect(e.pending).toBe(0);
    await e.shutdown();
  });
});

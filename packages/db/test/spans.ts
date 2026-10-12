import { randomUUID } from 'node:crypto';
import type { SpanPayload } from '@popcornai/core';

let clock = Date.parse('2026-10-01T12:00:00Z');

export function makeRun(
  options: { name?: string; status?: 'ok' | 'error'; startedAt?: number } = {},
) {
  const runId = randomUUID();
  const rootId = randomUUID();
  const start = options.startedAt ?? (clock += 60_000);
  const spans: SpanPayload[] = [];

  const child = (
    overrides: Partial<SpanPayload> & Pick<SpanPayload, 'kind' | 'name'>,
  ): SpanPayload => {
    const offset = spans.length * 100 + 10;
    const span: SpanPayload = {
      id: randomUUID(),
      runId,
      parentId: rootId,
      status: 'ok',
      startTime: start + offset,
      endTime: start + offset + 50,
      ...overrides,
    };
    spans.push(span);
    return span;
  };

  const root = (overrides: Partial<SpanPayload> = {}): SpanPayload => ({
    id: rootId,
    runId,
    parentId: null,
    kind: 'agent',
    name: options.name ?? 'support-triage',
    status: options.status ?? 'ok',
    startTime: start,
    endTime: start + spans.length * 100 + 100,
    input: { ticket: 'Where is my order A-1001?' },
    output: { category: 'shipping' },
    ...overrides,
  });

  return { runId, rootId, child, root, spans };
}

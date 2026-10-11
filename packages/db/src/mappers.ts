import type { StoredSpan } from '@popcorn-ai/core';
import type { SpanRow } from './schema';

export function toStoredSpan(row: SpanRow): StoredSpan {
  return {
    id: row.id,
    runId: row.runId,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    status: row.status,
    startTime: row.startMs,
    endTime: row.endMs,
    input: row.input ?? undefined,
    output: row.output ?? undefined,
    error: row.error,
    provider: row.provider,
    model: row.model,
    usage:
      row.tokensIn === null && row.tokensOut === null
        ? null
        : {
            inputTokens: row.tokensIn ?? 0,
            outputTokens: row.tokensOut ?? 0,
            ...(row.cacheReadTokens ? { cacheReadTokens: row.cacheReadTokens } : {}),
            ...(row.cacheWriteTokens ? { cacheWriteTokens: row.cacheWriteTokens } : {}),
          },
    costUsd: row.costUsd,
    attributes: row.attributes,
  };
}

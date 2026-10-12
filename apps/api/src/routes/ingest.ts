import { spanBatchSchema } from '@popcornai/core';
import type { FastifyPluginAsync } from 'fastify';
import { HttpError } from '../lib/errors';
import { convertOtlp, type OtlpTraceRequest } from '../ingest/otlp';
import type { IngestQueue } from '../ingest/queue';
import { z } from 'zod';

export interface IngestRoutesOptions {
  queue: IngestQueue;
}

export const ingestRoutes: FastifyPluginAsync<IngestRoutesOptions> = async (app, { queue }) => {
  /** FR-1.6: validate, hand off, answer 202. Writes happen in the worker when a queue is configured. */
  app.post('/v1/spans', async (request, reply) => {
    const batch = spanBatchSchema.parse(request.body);
    await queue.enqueue(request.project, batch.spans);
    return reply.status(202).send({ accepted: batch.spans.length });
  });

  /** FR-2.7: OTLP/HTTP with JSON encoding. Protobuf clients must set OTEL_EXPORTER_OTLP_PROTOCOL=http/json. */
  app.post('/v1/traces', async (request, reply) => {
    if (!request.headers['content-type']?.includes('application/json')) {
      throw new HttpError(
        415,
        'Only OTLP/HTTP JSON is supported; set OTEL_EXPORTER_OTLP_PROTOCOL=http/json',
        'unsupported_media_type',
      );
    }
    const spans = convertOtlp(request.body as OtlpTraceRequest);
    if (spans.length === 0) return reply.send({ partialSuccess: {} });

    const batch = z.object({ spans: spanBatchSchema.shape.spans }).parse({ spans });
    await queue.enqueue(request.project, batch.spans);
    return reply.send({ partialSuccess: {} });
  });
};

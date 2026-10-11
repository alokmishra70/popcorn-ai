import { ping, type Database } from '@popcorn-ai/db';
import type { FastifyPluginAsync } from 'fastify';
import type { IngestQueue } from '../ingest/queue';

export const healthRoutes: FastifyPluginAsync<{ db: Database; queue: IngestQueue }> = async (
  app,
  { db, queue },
) => {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    try {
      await ping(db);
      return { status: 'ok', ingest: queue.mode };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
};

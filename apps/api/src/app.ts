import cors from '@fastify/cors';
import type { DbHandle } from '@popcornai/db';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { IngestQueue } from './ingest/queue';
import { createAuthenticator } from './lib/auth';
import { errorHandler } from './lib/errors';
import { RunEvents } from './lib/run-events';
import { datasetRoutes } from './routes/datasets';
import { evalRoutes } from './routes/evals';
import { healthRoutes } from './routes/health';
import { ingestRoutes } from './routes/ingest';
import { runRoutes } from './routes/runs';
import { streamRoutes } from './routes/stream';

export interface AppDependencies {
  database: DbHandle;
  queue: IngestQueue;
  corsOrigins?: string[];
  bodyLimitBytes?: number;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({
  database,
  queue,
  corsOrigins = [],
  bodyLimitBytes,
  logger = false,
}: AppDependencies) {
  const app = Fastify({
    logger,
    bodyLimit: bodyLimitBytes ?? 16 * 1024 * 1024,
    trustProxy: true,
  });
  const events = new RunEvents(database.sql);

  app.setErrorHandler(errorHandler);
  app.addHook('onClose', async () => {
    await events.close();
  });
  await app.register(cors, { origin: corsOrigins.length ? corsOrigins : false });

  await app.register(healthRoutes, { db: database.db, queue });

  // Everything under /v1 is scoped to the project that owns the API key.
  await app.register(async (scoped) => {
    scoped.decorateRequest('project', null as never);
    scoped.addHook('onRequest', createAuthenticator(database.db));
    await scoped.register(ingestRoutes, { queue });
    await scoped.register(runRoutes, { db: database.db });
    await scoped.register(datasetRoutes, { db: database.db });
    await scoped.register(evalRoutes, { db: database.db });
    await scoped.register(streamRoutes, { events });
  });

  return app;
}

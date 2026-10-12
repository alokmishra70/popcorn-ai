import { createDb, deleteRunsOlderThan } from '@popcornai/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import {
  BullIngestQueue,
  InlineIngestQueue,
  redisConnection,
  type IngestQueue,
} from './ingest/queue';

const DAY_MS = 86_400_000;

const config = loadConfig();
const database = createDb(config.DATABASE_URL);
const queue: IngestQueue = config.REDIS_URL
  ? new BullIngestQueue(redisConnection(config.REDIS_URL))
  : new InlineIngestQueue(database.db);

const app = await buildApp({
  database,
  queue,
  corsOrigins: config.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  bodyLimitBytes: config.BODY_LIMIT_MB * 1024 * 1024,
  logger: {
    level: config.LOG_LEVEL,
    ...(config.LOG_PRETTY ? { transport: { target: 'pino-pretty' } } : {}),
  },
});

// Without a queue there is no worker process, so retention runs here.
let retentionTimer: NodeJS.Timeout | undefined;
if (queue.mode === 'inline' && config.RETENTION_DAYS > 0) {
  const sweep = () =>
    deleteRunsOlderThan(database.db, config.RETENTION_DAYS)
      .then((count) => count && app.log.info({ count }, 'retention: deleted old runs'))
      .catch((err: unknown) => app.log.error({ err }, 'retention sweep failed'));
  retentionTimer = setInterval(sweep, DAY_MS);
  retentionTimer.unref();
  void sweep();
}

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  clearInterval(retentionTimer);
  await app.close();
  await queue.close();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info({ ingest: queue.mode }, 'popcorn api ready');

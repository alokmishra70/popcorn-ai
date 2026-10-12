import { createDb, deleteRunsOlderThan } from '@popcornai/db';
import { Queue, Worker } from 'bullmq';
import { loadConfig } from './config';
import { INGEST_QUEUE, processIngestJob, redisConnection, type IngestJob } from './ingest/queue';

const MAINTENANCE_QUEUE = 'popcorn-maintenance';

const config = loadConfig();
if (!config.REDIS_URL) {
  console.error('REDIS_URL is required for the worker. Without it the API writes spans inline.');
  process.exit(1);
}

const connection = redisConnection(config.REDIS_URL);
const database = createDb(config.DATABASE_URL, { max: config.WORKER_CONCURRENCY + 2 });

const ingestWorker = new Worker<IngestJob>(
  INGEST_QUEUE,
  (job) => processIngestJob(database.db, job.data),
  {
    connection,
    concurrency: config.WORKER_CONCURRENCY,
  },
);
ingestWorker.on('failed', (job, err) => {
  console.error(`ingest job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

// FR-5.6: a daily repeatable job, so only one worker runs it however many are deployed.
const maintenance = new Queue(MAINTENANCE_QUEUE, { connection });
if (config.RETENTION_DAYS > 0) {
  await maintenance.upsertJobScheduler(
    'retention',
    { pattern: '17 3 * * *' },
    { name: 'retention' },
  );
} else {
  await maintenance.removeJobScheduler('retention');
}
const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async () => {
    const count = await deleteRunsOlderThan(database.db, config.RETENTION_DAYS);
    console.log(`retention: deleted ${count} run(s) older than ${config.RETENTION_DAYS} days`);
  },
  { connection },
);

console.log(`popcorn worker ready (concurrency ${config.WORKER_CONCURRENCY})`);

async function shutdown() {
  await Promise.all([ingestWorker.close(), maintenanceWorker.close(), maintenance.close()]);
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

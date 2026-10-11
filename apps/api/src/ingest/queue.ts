import type { SpanPayload } from '@popcorn-ai/core';
import { getProjectThresholds, ingestSpans, type Database, type Project } from '@popcorn-ai/db';
import { Queue, type ConnectionOptions } from 'bullmq';

export const INGEST_QUEUE = 'popcorn-ingest';

export interface IngestJob {
  projectId: string;
  spans: SpanPayload[];
}

export interface IngestQueue {
  readonly mode: 'inline' | 'queue';
  enqueue(project: Project, spans: SpanPayload[]): Promise<void>;
  close(): Promise<void>;
}

/** Writes spans during the request. Used when no Redis is configured. */
export class InlineIngestQueue implements IngestQueue {
  readonly mode = 'inline';

  constructor(private readonly db: Database) {}

  async enqueue(project: Project, spans: SpanPayload[]): Promise<void> {
    await ingestSpans(this.db, project, spans);
  }

  async close(): Promise<void> {}
}

/** Hands spans to the worker through BullMQ, so bursts don't wait on Postgres (FR-1.6). */
export class BullIngestQueue implements IngestQueue {
  readonly mode = 'queue';
  private readonly queue: Queue<IngestJob>;

  constructor(connection: ConnectionOptions) {
    this.queue = new Queue<IngestJob>(INGEST_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  async enqueue(project: Project, spans: SpanPayload[]): Promise<void> {
    await this.queue.add('spans', { projectId: project.id, spans });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

/** Processes one queued batch. Thresholds are read fresh so setting changes apply to the next batch. */
export async function processIngestJob(db: Database, job: IngestJob): Promise<void> {
  const project = await getProjectThresholds(db, job.projectId);
  if (!project) return; // Project deleted after the batch was queued.
  await ingestSpans(db, project, job.spans);
}

export function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

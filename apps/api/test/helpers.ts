import { randomUUID } from 'node:crypto';
import type { SpanPayload } from '@popcorn-ai/core';
import { createApiKey, createDb, createProject, type DbHandle } from '@popcorn-ai/db';
import { runMigrations } from '@popcorn-ai/db/migrate';
import { buildApp } from '../src/app';
import { InlineIngestQueue } from '../src/ingest/queue';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function createTestApp() {
  const database: DbHandle = createDb(TEST_DATABASE_URL!, { max: 4 });
  await runMigrations(database.db);
  const app = await buildApp({ database, queue: new InlineIngestQueue(database.db) });

  const reset = async () => {
    await database.sql`truncate projects cascade`;
    const project = await createProject(database.db, { slug: 'test', name: 'Test' });
    const { key } = await createApiKey(database.db, project.id, 'test');
    return { project, headers: { authorization: `Bearer ${key}` } };
  };

  const close = async () => {
    await app.close();
    await database.close();
  };

  return { app, database, reset, close };
}

export function agentRun(name = 'support-triage') {
  const runId = randomUUID();
  const rootId = randomUUID();
  const start = Date.now() - 5_000;
  const toolId = randomUUID();
  const spans: SpanPayload[] = [
    {
      id: toolId,
      runId,
      parentId: rootId,
      kind: 'tool',
      name: 'lookup_order',
      startTime: start + 100,
      endTime: start + 200,
      status: 'ok',
      input: { orderId: 'A-1001' },
      output: { status: 'shipped' },
      attributes: { 'popcorn.args_hash': 'abc' },
    },
    {
      id: rootId,
      runId,
      parentId: null,
      kind: 'agent',
      name,
      startTime: start,
      endTime: start + 1000,
      status: 'ok',
      input: { ticket: 'where is my order?' },
      output: { category: 'shipping' },
    },
  ];
  return { runId, spans };
}

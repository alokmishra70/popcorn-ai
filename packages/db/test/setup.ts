import { sql } from 'drizzle-orm';
import { createDb, type DbHandle } from '../src/client';
import { runMigrations } from '../src/migrate';
import { createProject } from '../src/repositories/projects';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function openTestDb(): Promise<DbHandle> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  const handle = createDb(TEST_DATABASE_URL, { max: 4 });
  await runMigrations(handle.db);
  return handle;
}

export async function resetDb(handle: DbHandle) {
  await handle.db.execute(
    sql`truncate projects, api_keys, runs, spans, fixtures, datasets, test_cases, eval_runs, eval_results cascade`,
  );
  return createProject(handle.db, { slug: 'test', name: 'Test' });
}

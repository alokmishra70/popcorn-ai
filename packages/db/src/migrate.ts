import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client';

/** Absolute path of the SQL migrations shipped with this package. */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}

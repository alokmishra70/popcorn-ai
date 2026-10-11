import { createDb } from '../client';
import { runMigrations } from '../migrate';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/popcorn';
const handle = createDb(url, { max: 1 });

try {
  await runMigrations(handle.db);
  console.log('migrations applied');
} finally {
  await handle.close();
}

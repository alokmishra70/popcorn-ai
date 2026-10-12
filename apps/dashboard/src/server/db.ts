import 'server-only';
import { createDb, type DbHandle } from '@popcornai/db';
import { env } from './env';

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { popcornDb?: DbHandle };

export const database: DbHandle = globalForDb.popcornDb ?? createDb(env.databaseUrl, { max: 10 });
if (process.env.NODE_ENV !== 'production') globalForDb.popcornDb = database;

export const db = database.db;

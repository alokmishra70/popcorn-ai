import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  /** The underlying postgres.js client; used for LISTEN/NOTIFY. */
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Pool size. Default 10. */
  max?: number;
}

export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const sql = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
  });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

export async function ping(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}

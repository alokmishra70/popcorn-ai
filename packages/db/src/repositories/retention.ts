import { lt, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { runs } from '../schema';

const DELETE_BATCH = 1000;

/**
 * Deletes runs that started more than `days` ago, in batches so a large backlog
 * doesn't hold one long transaction (FR-5.6). Spans and fixtures go with them
 * through ON DELETE CASCADE. Returns the number of runs deleted.
 */
export async function deleteRunsOlderThan(db: Database, days: number): Promise<number> {
  if (!Number.isInteger(days) || days <= 0) throw new RangeError('days must be a positive integer');
  const cutoff = sql`now() - make_interval(days => ${days})`;
  let total = 0;
  for (;;) {
    const deleted = await db
      .delete(runs)
      .where(
        sql`${runs.id} in (select id from ${runs} where ${lt(runs.startedAt, cutoff)} limit ${DELETE_BATCH})`,
      )
      .returning({ id: runs.id });
    total += deleted.length;
    if (deleted.length < DELETE_BATCH) return total;
  }
}

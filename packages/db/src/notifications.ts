import type postgres from 'postgres';
import { RUNS_CHANNEL, type RunNotification } from './repositories/ingest';

/**
 * Subscribes to run updates published by ingest (FR-2.6). Each listener holds a
 * dedicated connection, so callers should share one subscription per process.
 */
export async function listenForRuns(
  sql: postgres.Sql,
  onRun: (notification: RunNotification) => void,
): Promise<() => Promise<void>> {
  const { unlisten } = await sql.listen(RUNS_CHANNEL, (payload) => {
    try {
      onRun(JSON.parse(payload) as RunNotification);
    } catch {
      // Ignore malformed payloads; only ingest publishes on this channel.
    }
  });
  return unlisten;
}

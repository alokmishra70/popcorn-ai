import { EventEmitter } from 'node:events';
import { listenForRuns, type DbHandle, type RunNotification } from '@popcornai/db';

/**
 * One LISTEN connection per process, fanned out to every open SSE stream.
 * Started on the first subscriber.
 */
export class RunEvents {
  private readonly emitter = new EventEmitter();
  private starting: Promise<() => Promise<void>> | null = null;

  constructor(private readonly sql: DbHandle['sql']) {
    this.emitter.setMaxListeners(0);
  }

  async subscribe(projectId: string, onRun: (event: RunNotification) => void): Promise<() => void> {
    this.starting ??= listenForRuns(this.sql, (event) => this.emitter.emit(event.projectId, event));
    await this.starting;
    this.emitter.on(projectId, onRun);
    return () => this.emitter.off(projectId, onRun);
  }

  async close(): Promise<void> {
    if (this.starting) await (await this.starting)();
  }
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

const PREFIX = '[popcorn]';

export function createLogger(debug: boolean): Logger {
  return {
    debug: debug ? (message, ...args) => console.warn(PREFIX, message, ...args) : () => {},
    warn: (message, ...args) => console.warn(PREFIX, message, ...args),
  };
}

/** Logs a given warning at most once per interval; used for noisy conditions like a full queue. */
export function throttle(logger: Logger, intervalMs: number) {
  const lastLogged = new Map<string, number>();
  return (key: string, message: string) => {
    const now = Date.now();
    if (now - (lastLogged.get(key) ?? 0) < intervalMs) return;
    lastLogged.set(key, now);
    logger.warn(message);
  };
}

import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.string().url().optional(),
  /** Delete runs older than this many days. 0 turns retention off. */
  RETENTION_DAYS: z.coerce.number().int().nonnegative().default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanString.default(false),
  /** Comma-separated origins allowed to call the API from a browser. */
  CORS_ORIGINS: z.string().default(''),
  /** Max request body. Span batches with large payloads can be several MB. */
  BODY_LIMIT_MB: z.coerce.number().positive().default(16),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return parsed.data;
}

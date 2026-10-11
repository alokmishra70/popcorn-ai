import { authenticateApiKey, type Database, type Project } from '@popcorn-ai/db';
import type { FastifyRequest } from 'fastify';
import { HttpError } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    project: Project;
  }
}

/** Keys are re-checked after this long, so a revoked key stops working within it. */
const CACHE_TTL_MS = 10_000;
const MAX_CACHED_KEYS = 1000;

export function createAuthenticator(db: Database) {
  const cache = new Map<string, { project: Project; expiresAt: number }>();

  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    const key = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
    if (!key)
      throw new HttpError(
        401,
        'Missing API key. Send it as "Authorization: Bearer <key>".',
        'unauthorized',
      );

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      request.project = cached.project;
      return;
    }

    const project = await authenticateApiKey(db, key);
    if (!project) {
      cache.delete(key);
      throw new HttpError(401, 'Invalid or revoked API key', 'unauthorized');
    }
    if (cache.size >= MAX_CACHED_KEYS) cache.clear();
    cache.set(key, { project, expiresAt: Date.now() + CACHE_TTL_MS });
    request.project = project;
  };
}

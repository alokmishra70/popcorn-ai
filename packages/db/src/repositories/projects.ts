import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { apiKeys, projects, type ApiKey, type Project } from '../schema';

const KEY_PREFIX = 'pk_';
/** last_used_at is only rewritten when older than this, so ingest isn't one UPDATE per request. */
const LAST_USED_RESOLUTION_MS = 60_000;

export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export async function listProjects(db: Database): Promise<Project[]> {
  return db.select().from(projects).orderBy(projects.createdAt);
}

export async function getProjectBySlug(db: Database, slug: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.slug, slug));
  return row ?? null;
}

export async function createProject(
  db: Database,
  input: { slug: string; name: string },
): Promise<Project> {
  if (!SLUG_PATTERN.test(input.slug)) {
    throw new Error('slug must be lowercase letters, digits and dashes, 1-50 characters');
  }
  const [row] = await db.insert(projects).values(input).returning();
  return row!;
}

export async function updateProjectSettings(
  db: Database,
  projectId: string,
  settings: Partial<Pick<Project, 'name' | 'costThresholdUsd' | 'maxSteps'>>,
): Promise<void> {
  await db.update(projects).set(settings).where(eq(projects.id, projectId));
}

export interface CreatedApiKey {
  /** The full key. Shown once; only its hash is stored. */
  key: string;
  record: ApiKey;
}

export async function createApiKey(
  db: Database,
  projectId: string,
  name: string,
): Promise<CreatedApiKey> {
  const key = generateApiKey();
  const [record] = await db
    .insert(apiKeys)
    .values({ projectId, name, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashApiKey(key) })
    .returning();
  return { key, record: record! };
}

export async function listApiKeys(db: Database, projectId: string): Promise<ApiKey[]> {
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.projectId, projectId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(
  db: Database,
  projectId: string,
  keyId: string,
): Promise<boolean> {
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

/** Resolves an API key to its project, or null if the key is unknown or revoked. */
export async function authenticateApiKey(db: Database, key: string): Promise<Project | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const [row] = await db
    .select({ project: projects, keyId: apiKeys.id, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .innerJoin(projects, eq(projects.id, apiKeys.projectId))
    .where(and(eq(apiKeys.hash, hashApiKey(key)), isNull(apiKeys.revokedAt)));
  if (!row) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(apiKeys.id, row.keyId));
  }
  return row.project;
}

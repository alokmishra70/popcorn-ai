/**
 * Creates a project and an API key. Safe to re-run: the project is reused.
 *
 *   pnpm db:seed [slug]
 *
 * POPCORN_SEED_API_KEY pins the key (for docker compose, CI and the demo);
 * otherwise a new random key is created and printed.
 */
import { createDb } from '../client';
import {
  createApiKey,
  createProject,
  getProjectBySlug,
  hashApiKey,
} from '../repositories/projects';
import { apiKeys } from '../schema';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/popcorn';
const slug = process.argv[2] ?? process.env.POPCORN_SEED_PROJECT ?? 'support-bot';
const fixedKey = process.env.POPCORN_SEED_API_KEY;
const handle = createDb(url, { max: 1 });

const titleCase = (value: string) =>
  value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

try {
  const project =
    (await getProjectBySlug(handle.db, slug)) ??
    (await createProject(handle.db, { slug, name: titleCase(slug) }));

  let key: string;
  if (fixedKey) {
    if (!fixedKey.startsWith('pk_') || fixedKey.length < 20)
      throw new Error('POPCORN_SEED_API_KEY must start with pk_ and be at least 20 characters');
    await handle.db
      .insert(apiKeys)
      .values({
        projectId: project.id,
        name: 'seeded',
        prefix: fixedKey.slice(0, 9),
        hash: hashApiKey(fixedKey),
      })
      .onConflictDoNothing({ target: apiKeys.hash });
    key = fixedKey;
  } else {
    ({ key } = await createApiKey(
      handle.db,
      project.id,
      `local ${new Date().toISOString().slice(0, 10)}`,
    ));
  }

  console.log(`project  ${project.slug} (${project.id})`);
  console.log(`api key  ${fixedKey ? 'from POPCORN_SEED_API_KEY' : key}`);
  if (!fixedKey) console.log(`\nexport POPCORN_API_KEY=${key}`);
} finally {
  await handle.close();
}

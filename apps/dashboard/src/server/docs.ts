import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DOCS_DIR = process.env.POPCORN_DOCS_DIR ?? resolve(process.cwd(), '../../docs');

/** Order and titles of the docs sidebar (FR-5.3). File names map to URLs. */
export const docsNav = [
  { slug: 'quickstart', title: 'Quickstart' },
  { slug: 'concepts', title: 'Concepts' },
  { slug: 'sdk', title: 'SDK reference' },
  { slug: 'replay', title: 'Replay guide' },
  { slug: 'evals', title: 'Eval guide' },
  { slug: 'ci', title: 'CI guide' },
  { slug: 'self-hosting', title: 'Self-hosting' },
  { slug: 'opentelemetry', title: 'OpenTelemetry' },
  { slug: 'mcp', title: 'MCP server' },
] as const;

export async function readDoc(slug: string): Promise<string | null> {
  if (!docsNav.some((d) => d.slug === slug)) return null;
  try {
    return await readFile(resolve(DOCS_DIR, `${slug}.md`), 'utf8');
  } catch {
    return null;
  }
}

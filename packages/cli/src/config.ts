import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PopcornOptions } from '@popcornai/sdk';
import { createJiti } from 'jiti';

type AnyAgent = (input: never) => unknown;

export interface JudgeConfig {
  /** Judge model. Default: claude-haiku-5-5. */
  model?: string;
  /** Turn LLM-as-judge checks off; they are then skipped and reported as skipped. */
  enabled?: boolean;
}

export interface PopcornConfig {
  /**
   * Agents the eval runner can execute, keyed by the name their runs are
   * recorded under. Values may be plain functions or `popcorn.agent()` wrappers.
   */
  agents: Record<string, AnyAgent>;
  /** Options passed to `popcorn.init` before anything runs. */
  sdk?: PopcornOptions;
  judge?: JudgeConfig;
  /** Recorded with every eval run, so results can be compared across models and prompt versions. */
  metadata?: { model?: string; prompt?: string };
}

/** Typed helper for `popcorn.config.ts`. */
export function defineConfig(config: PopcornConfig): PopcornConfig {
  return config;
}

const CANDIDATES = [
  'popcorn.config.ts',
  'popcorn.config.mts',
  'popcorn.config.js',
  'popcorn.config.mjs',
];

export async function loadConfig(
  explicitPath?: string,
  cwd = process.cwd(),
): Promise<{ config: PopcornConfig; path: string }> {
  const path = explicitPath
    ? resolve(cwd, explicitPath)
    : CANDIDATES.map((name) => resolve(cwd, name)).find((candidate) => existsSync(candidate));
  if (!path || !existsSync(path)) {
    throw new Error(
      explicitPath
        ? `Config file not found: ${explicitPath}`
        : `No popcorn.config.ts found in ${cwd}. Create one with defineConfig({ agents: { ... } }).`,
    );
  }

  const jiti = createJiti(pathToFileURL(cwd).href, { interopDefault: true });
  const loaded = await jiti.import<PopcornConfig | { default: PopcornConfig }>(path, {
    default: true,
  });
  const config = ('default' in loaded ? loaded.default : loaded) as PopcornConfig;
  if (!config || typeof config.agents !== 'object' || Object.keys(config.agents).length === 0) {
    throw new Error(
      `${path} must export defineConfig({ agents: { ... } }) with at least one agent`,
    );
  }
  return { config, path };
}

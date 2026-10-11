#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import pkg from '../package.json';
import { registerDataset } from './commands/dataset';
import { registerReview } from './commands/review';
import { registerRewind } from './commands/rewind';
import { registerWatch } from './commands/watch';

const program = new Command()
  .name('popcorn')
  .description('Grab the popcorn. Watch what your agent really did.')
  .version(pkg.version)
  .option(
    '--env-file <path>',
    'load environment variables from this file (default: ./.env if present)',
  )
  .hook('preAction', (command) => {
    const explicit = command.opts<{ envFile?: string }>().envFile;
    const path = resolve(explicit ?? '.env');
    if (explicit && !existsSync(path)) throw new Error(`env file not found: ${explicit}`);
    // Variables already set in the environment win over the file.
    if (existsSync(path)) process.loadEnvFile(path);
  });

registerReview(program);
registerRewind(program);
registerWatch(program);
registerDataset(program);

program.parseAsync().catch((error: unknown) => {
  console.error(`popcorn: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});

import { checkListSchema } from '@popcornai/core';
import { popcorn } from '@popcornai/sdk';
import type { Command } from 'commander';

interface AddFlags {
  suite: string;
  name?: string;
  expected?: string;
  checks?: string;
}

function parseJson(label: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`--${label} must be valid JSON`);
  }
}

export function registerDataset(program: Command) {
  const dataset = program.command('dataset').description('Manage eval datasets');

  dataset
    .command('add <runId>')
    .description('Save a recorded run as a test case')
    .requiredOption('-s, --suite <name>', 'dataset to add the case to (created if missing)')
    .option('--name <name>', 'case name')
    .option('--expected <json>', 'expected outcome, as JSON')
    .option('--checks <json>', 'checks, as a JSON array')
    .action(async (runId: string, flags: AddFlags) => {
      const checks = flags.checks ? checkListSchema.parse(parseJson('checks', flags.checks)) : [];
      const created = await popcorn.dataset.add(runId, {
        dataset: flags.suite,
        name: flags.name,
        expected: parseJson('expected', flags.expected),
        checks,
      });
      console.log(`added "${created.name}" (${created.id}) to ${flags.suite}`);
    });
}

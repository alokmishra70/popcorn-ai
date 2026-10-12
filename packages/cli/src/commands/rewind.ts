import { readFileSync } from 'node:fs';
import { formatDuration, formatUsd } from '@popcornai/core';
import { popcorn } from '@popcornai/sdk';
import type { Command } from 'commander';
import { loadConfig } from '../config';

interface RewindFlags {
  config?: string;
  fromStep: string;
  model?: string;
  systemFile?: string;
  onMiss: 'live' | 'fail';
  json?: boolean;
}

export function registerRewind(program: Command) {
  program
    .command('rewind <runId>')
    .description(
      'Replay a recorded run with recorded tool outputs, optionally with a new model or prompt',
    )
    .option('-c, --config <path>', 'path to popcorn.config.ts (registers your agents)')
    .option('--from-step <n>', 'LLM calls before this step return their recorded responses', '0')
    .option('--model <model>', 'model for live LLM calls')
    .option('--system-file <path>', 'replace the system prompt with the contents of this file')
    .option('--on-miss <policy>', 'when a tool is called with new arguments: live or fail', 'fail')
    .option('--json', 'print the full result as JSON')
    .action(async (runId: string, flags: RewindFlags) => {
      const { config } = await loadConfig(flags.config);
      popcorn.init(config.sdk ?? {});

      const result = await popcorn.rewind(runId, {
        fromStep: Number(flags.fromStep),
        onFixtureMiss: flags.onMiss,
        overrides: {
          ...(flags.model ? { model: flags.model } : {}),
          ...(flags.systemFile ? { system: readFileSync(flags.systemFile, 'utf8') } : {}),
        },
      });
      await popcorn.shutdown();

      if (flags.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const { diff } = result;
      console.log(`\nRewound ${result.originalRunId} -> ${result.runId}`);
      if (result.error) console.log(`agent failed: ${result.error.message}`);
      console.log(
        `steps: ${diff.counts.unchanged} unchanged, ${diff.counts.changed} changed, ${diff.counts.added} added, ${diff.counts.removed} removed`,
      );
      for (const step of diff.steps) {
        const view = step.replay ?? step.original!;
        const fields = step.fields.length ? ` (${step.fields.join(', ')})` : '';
        const fixture = step.replay?.fixture ? ` [fixture ${step.replay.fixture}]` : '';
        console.log(
          `  ${step.change.padEnd(9)} ${view.kind.padEnd(4)} ${view.name}${fields}${fixture}`,
        );
      }
      const { original, replay } = diff.totals;
      console.log(`\nfinal answer ${diff.finalOutput.changed ? 'changed' : 'unchanged'}`);
      console.log(
        `cost ${formatUsd(original.costUsd)} -> ${formatUsd(replay.costUsd)}, time ${formatDuration(original.durationMs)} -> ${formatDuration(replay.durationMs)}`,
      );
      if (diff.finalOutput.changed) console.log(JSON.stringify(diff.finalOutput.replay, null, 2));
      process.exitCode = result.error ? 1 : 0;
    });
}

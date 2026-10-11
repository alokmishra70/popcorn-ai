import { formatDuration, formatTokens, formatUsd } from '@popcorn-ai/core';
import type { Command } from 'commander';
import { ApiClient } from '../api';

interface RunEvent {
  runId: string;
  status: string;
}

interface RunDetail {
  run: {
    id: string;
    name: string;
    status: string;
    durationMs: number | null;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    flags: string[];
  };
}

/** Tails runs as they arrive (FR-2.6), over the API's server-sent events stream. */
export function registerWatch(program: Command) {
  program
    .command('watch')
    .description('Live tail of incoming runs')
    .option('--all', 'also show runs that are still in progress')
    .action(async (flags: { all?: boolean }) => {
      const api = new ApiClient();
      const controller = new AbortController();
      process.once('SIGINT', () => controller.abort());

      console.log(`watching ${api.endpoint} (ctrl-c to stop)\n`);
      const response = await api.stream('/v1/stream', controller.signal);
      const seen = new Set<string>();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        for await (const chunk of response.body!) {
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = message.split('\n').find((l) => l.startsWith('data: '));
            if (!data) continue;
            const event = JSON.parse(data.slice(6)) as RunEvent;
            if (event.status === 'running' && !flags.all) continue;
            const key = `${event.runId}:${event.status}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const { run } = await api.get<RunDetail>(`/v1/runs/${event.runId}`);
            printRun(run);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    });
}

function printRun(run: RunDetail['run']) {
  const time = new Date().toLocaleTimeString();
  const status = run.status === 'error' ? 'ERR ' : run.status === 'ok' ? 'ok  ' : '... ';
  const flags = run.flags.length ? `  [${run.flags.join(', ')}]` : '';
  console.log(
    `${time}  ${status} ${run.name.padEnd(24)} ${formatDuration(run.durationMs).padStart(8)}  ${formatTokens(run.tokensIn + run.tokensOut).padStart(6)} tok  ${formatUsd(run.costUsd).padStart(8)}  ${run.id}${flags}`,
  );
}

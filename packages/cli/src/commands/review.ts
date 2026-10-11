import { writeFileSync } from 'node:fs';
import { popcorn } from '@popcorn-ai/sdk';
import type { Command } from 'commander';
import { loadConfig } from '../config';
import { createAnthropicJudge } from '../judge';
import { renderReport, type ReportFormat } from '../review/report';
import { runReview } from '../review/runner';

interface ReviewFlags {
  suite: string;
  config?: string;
  concurrency: string;
  repeat: string;
  baseline: string;
  label?: string;
  format: ReportFormat;
  output?: string;
  upload: boolean;
  failOn: 'regression' | 'any' | 'never';
}

export function registerReview(program: Command) {
  program
    .command('review')
    .description('Run an eval suite against your agent and compare with the baseline branch')
    .requiredOption('-s, --suite <name>', 'dataset (suite) to run')
    .option('-c, --config <path>', 'path to popcorn.config.ts')
    .option('--concurrency <n>', 'cases to run at once', '4')
    .option('--repeat <n>', 'run each case n times and report flaky cases', '1')
    .option('--baseline <branch>', 'branch whose latest eval run is the baseline', 'main')
    .option('--label <text>', 'label stored with this eval run')
    .option('-f, --format <format>', 'table, markdown or json', 'table')
    .option('-o, --output <file>', 'also write the report to a file')
    .option('--no-upload', 'do not store this eval run')
    .option(
      '--fail-on <when>',
      'exit non-zero on: regression, any (failure) or never',
      'regression',
    )
    .action(async (flags: ReviewFlags) => {
      const { config } = await loadConfig(flags.config);
      popcorn.init(config.sdk ?? {});
      const judge =
        config.judge?.enabled === false
          ? undefined
          : createAnthropicJudge({ model: config.judge?.model });

      const interactive = process.stderr.isTTY && flags.format === 'table';
      const report = await runReview({
        suite: flags.suite,
        config,
        judge,
        concurrency: Number(flags.concurrency),
        repeat: Number(flags.repeat),
        baselineBranch: flags.baseline,
        label: flags.label,
        upload: flags.upload,
        onProgress: interactive
          ? (done, total) => process.stderr.write(`\rrunning ${done}/${total}`)
          : undefined,
      });
      if (interactive) process.stderr.write('\r\u001b[K');

      const rendered = renderReport(report, flags.format);
      console.log(rendered);
      if (flags.output) {
        const fileFormat = flags.output.endsWith('.json')
          ? 'json'
          : flags.output.endsWith('.md')
            ? 'markdown'
            : flags.format;
        writeFileSync(flags.output, renderReport(report, fileFormat));
      }

      await popcorn.shutdown();
      const failed =
        flags.failOn === 'any'
          ? report.comparison.current.passed < report.comparison.current.total
          : flags.failOn === 'regression' && report.comparison.regressed;
      process.exitCode = failed ? 1 : 0;
    });
}

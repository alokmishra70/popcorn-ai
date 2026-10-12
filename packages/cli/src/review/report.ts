import {
  formatDuration,
  formatPercent,
  formatSigned,
  formatUsd,
  type CaseComparison,
  type EvalAggregate,
} from '@popcornai/core';
import type { CaseResult, ReviewReport } from './runner';

export type ReportFormat = 'table' | 'markdown' | 'json';

/** Marker the GitHub Action uses to find and update its previous comment. */
export const commentMarker = (suite: string) => `<!-- popcorn-review:${suite} -->`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One themed line, then the facts: "Reviews are in: 37/40, up 2 from main. 1 new blooper." */
export function headline(report: ReviewReport): string {
  const { current, baseline, broken } = report.comparison;
  const score = `${current.passed}/${current.total}`;
  let trend = '';
  if (baseline && report.baseline) {
    const delta = current.passed - baseline.passed;
    const where = report.baseline.branch ?? 'baseline';
    trend =
      delta === 0
        ? `, same as ${where}`
        : `, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} from ${where}`;
  }
  const bloopers = broken === 0 ? 'No new bloopers.' : `${plural(broken, 'new blooper')}.`;
  return `Reviews are in: ${score}${trend}. ${bloopers}`;
}

export function stars(passRate: number): string {
  const filled = Math.round(passRate * 5);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function percentChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '0%' : 'new';
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  return change === 0 ? '0%' : formatSigned(change, (n) => `${n.toFixed(1)}%`);
}

interface Row {
  label: string;
  current: string;
  baseline: string;
  change: string;
}

function summaryRows(current: EvalAggregate, baseline: EvalAggregate | null): Row[] {
  return [
    {
      label: 'Passing',
      current: `${current.passed}/${current.total} (${formatPercent(current.passRate, 1)})`,
      baseline: baseline
        ? `${baseline.passed}/${baseline.total} (${formatPercent(baseline.passRate, 1)})`
        : '-',
      change: baseline ? formatSigned(current.passed - baseline.passed) : '',
    },
    {
      label: 'Cost per case',
      current: formatUsd(current.avgCostUsd),
      baseline: baseline ? formatUsd(baseline.avgCostUsd) : '-',
      change: baseline ? percentChange(current.avgCostUsd, baseline.avgCostUsd) : '',
    },
    {
      label: 'p95 latency',
      current: formatDuration(current.p95LatencyMs),
      baseline: baseline ? formatDuration(baseline.p95LatencyMs) : '-',
      change: baseline ? percentChange(current.p95LatencyMs, baseline.p95LatencyMs) : '',
    },
  ];
}

function firstFailure(results: CaseResult[], testCaseId: string): string {
  const failed = results.find((r) => r.testCaseId === testCaseId && !r.passed);
  const check = failed?.checks.find((c) => !c.passed);
  return check ? `${check.name}${check.reason ? `: ${check.reason}` : ''}` : '';
}

const casesWith = (cases: CaseComparison[], change: CaseComparison['change']) =>
  cases.filter((c) => c.change === change);

export function renderMarkdown(report: ReviewReport): string {
  const { comparison } = report;
  const baselineLabel = report.baseline
    ? `${report.baseline.branch ?? 'baseline'}${report.baseline.sha ? ` (${report.baseline.sha.slice(0, 7)})` : ''}`
    : 'baseline';
  const lines: string[] = [
    commentMarker(report.suite),
    `**${headline(report)}**`,
    '',
    `| | This run | ${baselineLabel} | Change |`,
    '|---|---|---|---|',
    ...summaryRows(comparison.current, comparison.baseline).map(
      (r) => `| ${r.label} | ${r.current} | ${r.baseline} | ${r.change} |`,
    ),
    '',
  ];

  const section = (title: string, cases: CaseComparison[], withReason: boolean) => {
    if (cases.length === 0) return;
    lines.push(
      `<details${title.startsWith('Broken') ? ' open' : ''}><summary><b>${title} (${cases.length})</b></summary>`,
      '',
    );
    for (const c of cases) {
      const reason = withReason ? firstFailure(report.results, c.testCaseId) : '';
      lines.push(`- \`${c.name}\`${reason ? ` — ${escapeMd(reason)}` : ''}`);
    }
    lines.push('', '</details>', '');
  };

  section('Broken', casesWith(comparison.cases, 'broken'), true);
  section('Fixed', casesWith(comparison.cases, 'fixed'), false);
  section('Still failing', casesWith(comparison.cases, 'still_failing'), true);
  if (report.flaky.length > 0) {
    lines.push(`<details><summary><b>Flaky (${report.flaky.length})</b></summary>`, '');
    for (const c of report.flaky)
      lines.push(`- \`${c.name}\` passed ${c.passes} of ${c.attempts} attempts`);
    lines.push('', '</details>', '');
  }

  lines.push(
    `<sub>Suite <code>${report.suite}</code> · ${stars(comparison.current.passRate)} · total spend ${formatUsd(report.totalCostUsd)} · ${formatDuration(report.durationMs)}${report.git.sha ? ` · ${report.git.sha.slice(0, 7)}` : ''}</sub>`,
  );
  return lines.join('\n');
}

const escapeMd = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300);

const color = (code: number) => (text: string) =>
  process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[${code}m${text}\u001b[0m` : text;
const red = color(31);
const green = color(32);
const yellow = color(33);
const dim = color(2);
const bold = color(1);

export function renderTable(report: ReviewReport): string {
  const { comparison } = report;
  const rows = summaryRows(comparison.current, comparison.baseline);
  const width = (pick: (r: Row) => string, header: string) =>
    Math.max(header.length, ...rows.map((r) => pick(r).length));
  const w = [
    width((r) => r.label, ''),
    width((r) => r.current, 'this run'),
    width((r) => r.baseline, 'baseline'),
    width((r) => r.change, 'change'),
  ];
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(w[i]!)).join('   ');

  const out: string[] = [
    '',
    bold(headline(report)) + '  ' + yellow(stars(comparison.current.passRate)),
    '',
    dim(line(['', 'this run', report.baseline?.branch ?? 'baseline', 'change'])),
    ...rows.map((r) => line([r.label, r.current, r.baseline, r.change])),
    '',
  ];

  for (const c of casesWith(comparison.cases, 'broken')) {
    out.push(`${red('broken')}   ${c.name}  ${dim(firstFailure(report.results, c.testCaseId))}`);
  }
  for (const c of casesWith(comparison.cases, 'fixed')) out.push(`${green('fixed')}    ${c.name}`);
  for (const c of casesWith(comparison.cases, 'still_failing')) {
    out.push(`${yellow('failing')}  ${c.name}  ${dim(firstFailure(report.results, c.testCaseId))}`);
  }
  for (const c of report.flaky)
    out.push(
      `${yellow('flaky')}    ${c.name}  ${dim(`${c.passes}/${c.attempts} attempts passed`)}`,
    );

  const skipped = report.results.reduce((n, r) => n + r.checks.filter((c) => c.skipped).length, 0);
  if (skipped > 0) out.push('', dim(`${plural(skipped, 'check')} skipped (judge turned off)`));

  out.push(
    '',
    dim(
      `suite ${report.suite} · eval run ${report.evalRunId}${report.uploaded ? '' : ' (not uploaded)'} · spend ${formatUsd(report.totalCostUsd)} · ${formatDuration(report.durationMs)}`,
    ),
  );
  return out.join('\n');
}

export function renderReport(report: ReviewReport, format: ReportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'markdown':
      return renderMarkdown(report);
    case 'table':
      return renderTable(report);
  }
}

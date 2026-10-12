import { formatDuration, formatPercent, formatTokens, formatUsd } from '@popcornai/core';
import { getDailyStats, getModelStats, getOverviewTotals, getToolStats } from '@popcornai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CostChart, ErrorRateChart, LatencyChart, RunsChart } from '@/components/charts';
import { PageHeader } from '@/components/page-header';
import { Stat } from '@/components/stat';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Box Office' };

const RANGES = [7, 14, 30] as const;

/** Box Office: cost, tokens, latency and error rate over time (FR-2.5). Excludes eval runs. */
export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const [{ project: slug }, { days: daysParam }] = await Promise.all([params, searchParams]);
  const project = await requireProject(slug);
  const days = RANGES.find((d) => String(d) === daysParam) ?? 14;

  const [daily, totals, models, tools] = await Promise.all([
    getDailyStats(db, project.id, days),
    getOverviewTotals(db, project.id, days),
    getModelStats(db, project.id, days),
    getToolStats(db, project.id, days),
  ]);

  return (
    <>
      <PageHeader
        title="Box Office"
        subtitle={`Production runs over the last ${days} days. Eval runs are excluded.`}
        actions={
          <div className="flex rounded-md border bg-surface p-0.5">
            {RANGES.map((range) => (
              <Link
                key={range}
                href={`?days=${range}`}
                className={cn(
                  'rounded px-2.5 py-1 text-xs',
                  range === days ? 'bg-surface-muted font-medium' : 'text-muted',
                )}
              >
                {range}d
              </Link>
            ))}
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Runs" value={totals.runs.toLocaleString()} />
        <Stat
          label="Error rate"
          value={totals.runs ? formatPercent(totals.errors / totals.runs, 1) : '-'}
          hint={`${totals.errors} errors`}
        />
        <Stat
          label="Flagged"
          value={totals.flagged}
          hint={
            <Link className="hover:text-brand" href={`/p/${project.slug}/bloopers`}>
              see bloopers
            </Link>
          }
        />
        <Stat
          label="p50 / p95"
          value={
            <span className="text-base">
              {formatDuration(totals.p50Ms)} / {formatDuration(totals.p95Ms)}
            </span>
          }
        />
        <Stat
          label="Spend"
          value={formatUsd(totals.costUsd)}
          hint={totals.runs ? `${formatUsd(totals.costUsd / totals.runs)} per run` : undefined}
        />
        <Stat label="Tokens" value={formatTokens(totals.tokens)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Runs and errors per day">
          <RunsChart data={daily} />
        </ChartCard>
        <ChartCard title="Error rate">
          <ErrorRateChart data={daily} />
        </ChartCard>
        <ChartCard title="Run latency, p50 and p95">
          <LatencyChart data={daily} />
        </ChartCard>
        <ChartCard title="Cost per day">
          <CostChart data={daily} />
        </ChartCard>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>Model</Th>
                <Th className="text-right">Calls</Th>
                <Th className="text-right">Tokens</Th>
                <Th className="text-right">p95</Th>
                <Th className="text-right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <Tr key={m.model}>
                  <Td className="font-mono text-xs">{m.model}</Td>
                  <Td className="text-right tabular-nums">{m.calls.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">{formatTokens(m.tokens)}</Td>
                  <Td className="text-right tabular-nums">{formatDuration(m.p95Ms)}</Td>
                  <Td className="text-right tabular-nums">{formatUsd(m.costUsd)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tools</CardTitle>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>Tool</Th>
                <Th className="text-right">Calls</Th>
                <Th className="text-right">Error rate</Th>
                <Th className="text-right">p95</Th>
                <Th className="text-right">Cache hit rate</Th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <Tr key={t.tool}>
                  <Td className="font-mono text-xs">{t.tool}</Td>
                  <Td className="text-right tabular-nums">{t.calls.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">
                    {formatPercent(t.errors / t.calls, 1)}
                  </Td>
                  <Td className="text-right tabular-nums">{formatDuration(t.p95Ms)}</Td>
                  <Td className="text-right tabular-nums">
                    {t.cacheLookups ? (
                      formatPercent(t.cacheHits / t.cacheLookups)
                    ) : (
                      <span className="text-muted">not cached</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

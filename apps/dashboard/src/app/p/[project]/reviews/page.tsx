import { formatDuration, formatPercent, formatUsd } from '@popcornai/core';
import { getJudgeAgreement, listEvalRuns } from '@popcornai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CompareRunsForm } from '@/components/compare-runs-form';
import { EmptyState, PageHeader } from '@/components/page-header';
import { Stars } from '@/components/stars';
import { Stat } from '@/components/stat';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Reviews' };

export default async function ReviewsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await requireProject(slug);
  const [evalRuns, agreement] = await Promise.all([
    listEvalRuns(db, project.id, { limit: 100 }),
    getJudgeAgreement(db, project.id),
  ]);

  return (
    <>
      <PageHeader title="Reviews" subtitle="Every run of an eval suite, locally or in CI." />
      {evalRuns.length === 0 ? (
        <EmptyState title="No reviews yet">
          Build a dataset, then run{' '}
          <code className="font-mono">popcorn review --suite &lt;name&gt;</code>.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Reviews" value={evalRuns.length} />
            <Stat
              label="Latest pass rate"
              value={formatPercent(evalRuns[0]!.passRate, 1)}
              hint={evalRuns[0]!.datasetName}
            />
            <Stat
              label="Judge agreement"
              value={agreement.rate === null ? '-' : formatPercent(agreement.rate)}
              hint={
                agreement.reviewed
                  ? `${agreement.agreed} of ${agreement.reviewed} verdicts marked right`
                  : 'mark judge verdicts on a review to calibrate'
              }
            />
            <Stat
              label="Spend on reviews"
              value={formatUsd(evalRuns.reduce((s, r) => s + r.costUsd, 0))}
            />
          </div>
          <CompareRunsForm
            project={project.slug}
            runs={evalRuns.map((r) => ({
              id: r.id,
              label: `${r.datasetName} · ${r.gitBranch ?? 'local'} · ${formatDateTime(r.startedAt)} · ${r.passed}/${r.total}`,
            }))}
          />
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Suite</Th>
                  <Th>Score</Th>
                  <Th>Branch</Th>
                  <Th>Model</Th>
                  <Th className="text-right">p95</Th>
                  <Th className="text-right">Cost</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {evalRuns.map((run) => (
                  <Tr key={run.id}>
                    <Td>
                      <Link
                        className="font-medium hover:text-brand"
                        href={`/p/${project.slug}/reviews/${run.id}`}
                      >
                        {run.datasetName}
                      </Link>
                      {run.label ? (
                        <span className="ml-2 text-xs text-muted">{run.label}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Stars passRate={run.passRate} />
                        <span className="tabular-nums">
                          {run.passed}/{run.total}
                        </span>
                        {run.repeat > 1 ? <Badge>x{run.repeat}</Badge> : null}
                      </span>
                    </Td>
                    <Td>
                      {run.gitBranch ? (
                        <Badge>{run.gitBranch}</Badge>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                      {run.gitSha ? (
                        <span className="ml-1.5 font-mono text-xs text-muted">
                          {run.gitSha.slice(0, 7)}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted">{run.model ?? '-'}</Td>
                    <Td className="text-right tabular-nums">{formatDuration(run.p95LatencyMs)}</Td>
                    <Td className="text-right tabular-nums">{formatUsd(run.costUsd)}</Td>
                    <Td className="text-xs text-muted" title={formatDateTime(run.startedAt)}>
                      {timeAgo(run.startedAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

import { checkLabel, checkListSchema, formatPercent, formatUsd } from '@popcorn-ai/core';
import { getDataset, listEvalRuns, listTestCases } from '@popcorn-ai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { Stars } from '@/components/stars';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { shortId, timeAgo } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

type Params = Promise<{ project: string; name: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).name) };
}

export default async function DatasetPage({ params }: { params: Params }) {
  const { project: slug, name } = await params;
  const project = await requireProject(slug);
  const dataset = await getDataset(db, project.id, decodeURIComponent(name));
  if (!dataset) notFound();

  const [cases, evalRuns] = await Promise.all([
    listTestCases(db, dataset.id),
    listEvalRuns(db, project.id, { datasetId: dataset.id, limit: 20 }),
  ]);
  const command = `npx popcorn review --suite ${dataset.name}`;

  return (
    <>
      <PageHeader
        title={dataset.name}
        subtitle={`${cases.length} case${cases.length === 1 ? '' : 's'}${dataset.agentName ? ` · runs agent ${dataset.agentName}` : ''}`}
        actions={
          <span className="flex items-center gap-1 rounded-md border bg-surface py-0.5 pr-0.5 pl-3 font-mono text-xs">
            {command}
            <CopyButton text={command} label="Copy review command" />
          </span>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Test cases</CardTitle>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>Case</Th>
                <Th>Checks</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const checks = checkListSchema.safeParse(c.checks);
                return (
                  <Tr key={c.id}>
                    <Td className="max-w-80">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate font-mono text-xs text-muted">
                        {JSON.stringify(c.input)}
                      </p>
                    </Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {checks.success ? (
                          checks.data.map((check, i) => (
                            <Badge
                              key={i}
                              tone={check.type === 'llm_judge' ? 'info' : 'neutral'}
                              title={checkLabel(check)}
                            >
                              {check.name ?? check.type.replace(/_/g, ' ')}
                            </Badge>
                          ))
                        ) : (
                          <Badge tone="danger">invalid checks</Badge>
                        )}
                      </span>
                    </Td>
                    <Td>
                      {c.sourceRunId ? (
                        <Link
                          className="font-mono text-xs hover:text-brand"
                          href={`/p/${project.slug}/runs/${c.sourceRunId}`}
                        >
                          {shortId(c.sourceRunId)}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">hand written</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Review history</CardTitle>
          </CardHeader>
          {evalRuns.length === 0 ? (
            <p className="p-4 text-sm text-muted">Not reviewed yet. Run the command above.</p>
          ) : (
            <ul className="divide-y">
              {evalRuns.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/p/${project.slug}/reviews/${run.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-muted/60"
                  >
                    <span className="flex items-center gap-2">
                      <Stars passRate={run.passRate} />
                      <span className="tabular-nums">
                        {run.passed}/{run.total}
                      </span>
                      <span className="text-muted">{formatPercent(run.passRate)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {run.gitBranch ? <Badge>{run.gitBranch}</Badge> : null}
                      {formatUsd(run.costUsd)} · {timeAgo(run.startedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

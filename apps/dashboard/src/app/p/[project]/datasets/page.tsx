import { formatPercent } from '@popcornai/core';
import { listDatasets } from '@popcornai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/page-header';
import { Stars } from '@/components/stars';
import { Card } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { timeAgo } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Datasets' };

export default async function DatasetsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await requireProject(slug);
  const datasets = await listDatasets(db, project.id);

  return (
    <>
      <PageHeader
        title="Datasets"
        subtitle="Eval suites built from real runs or written by hand."
      />
      {datasets.length === 0 ? (
        <EmptyState title="No datasets yet">
          Open any run and choose Save as test case, or call{' '}
          <code className="font-mono">popcorn.dataset.add(runId, {'{ dataset }'})</code>.
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Agent</Th>
                <Th className="text-right">Cases</Th>
                <Th>Last review</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <Link
                      className="font-medium hover:text-brand"
                      href={`/p/${project.slug}/datasets/${encodeURIComponent(d.name)}`}
                    >
                      {d.name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{d.agentName ?? '-'}</Td>
                  <Td className="text-right tabular-nums">{d.caseCount}</Td>
                  <Td>
                    {d.lastPassRate !== null ? (
                      <span className="flex items-center gap-2">
                        <Stars passRate={d.lastPassRate} />{' '}
                        <span className="tabular-nums">{formatPercent(d.lastPassRate)}</span>
                      </span>
                    ) : (
                      <span className="text-muted">never run</span>
                    )}
                  </Td>
                  <Td className="text-xs text-muted">
                    {d.lastEvalAt ? timeAgo(d.lastEvalAt) : ''}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

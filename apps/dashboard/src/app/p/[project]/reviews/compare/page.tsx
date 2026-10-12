import { compareEvalRuns } from '@popcornai/core';
import { getEvalRun, toEvalOutcome } from '@popcornai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EvalComparisonView } from '@/components/eval-comparison';
import { PageHeader } from '@/components/page-header';
import { formatDateTime } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Compare reviews' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ baseline?: string; current?: string }>;
}) {
  const [{ project: slug }, { baseline: baselineId, current: currentId }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!baselineId || !currentId || !UUID.test(baselineId) || !UUID.test(currentId)) notFound();
  const project = await requireProject(slug);
  const [baseline, current] = await Promise.all([
    getEvalRun(db, project.id, baselineId),
    getEvalRun(db, project.id, currentId),
  ]);
  if (!baseline || !current) notFound();

  const describe = (d: NonNullable<typeof baseline>) =>
    [d.dataset.name, d.evalRun.model, d.evalRun.gitBranch, formatDateTime(d.evalRun.startedAt)]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      <PageHeader
        title="Compare reviews"
        subtitle={
          <>
            <Link
              className="hover:text-brand"
              href={`/p/${project.slug}/reviews/${baseline.evalRun.id}`}
            >
              {describe(baseline)}
            </Link>{' '}
            →{' '}
            <Link
              className="hover:text-brand"
              href={`/p/${project.slug}/reviews/${current.evalRun.id}`}
            >
              {describe(current)}
            </Link>
          </>
        }
      />
      <EvalComparisonView
        comparison={compareEvalRuns(toEvalOutcome(current), toEvalOutcome(baseline))}
        baselineLabel="baseline"
      />
    </>
  );
}

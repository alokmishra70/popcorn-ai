import { diffRuns } from '@popcorn-ai/core';
import { getRun } from '@popcorn-ai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DiffView } from '@/components/diff-view';
import { PageHeader } from '@/components/page-header';
import { shortId } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Rewind diff' };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function DiffPage({
  params,
}: {
  params: Promise<{ project: string; runId: string; otherId: string }>;
}) {
  const { project: slug, runId, otherId } = await params;
  if (!UUID.test(runId) || !UUID.test(otherId)) notFound();
  const project = await requireProject(slug);
  const [original, replay] = await Promise.all([
    getRun(db, project.id, runId),
    getRun(db, project.id, otherId),
  ]);
  if (!original || !replay) notFound();

  const base = `/p/${project.slug}/runs`;
  return (
    <>
      <PageHeader
        title="Original vs rewind"
        subtitle={
          <>
            <Link className="font-mono hover:text-brand" href={`${base}/${original.run.id}`}>
              {shortId(original.run.id)}
            </Link>{' '}
            →{' '}
            <Link className="font-mono hover:text-brand" href={`${base}/${replay.run.id}`}>
              {shortId(replay.run.id)}
            </Link>{' '}
            · {original.run.name}
          </>
        }
      />
      <DiffView diff={diffRuns(original.spans, replay.spans)} />
    </>
  );
}

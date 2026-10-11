import { RUN_FLAGS } from '@popcorn-ai/core';
import { countRuns, getRunFacets, listRuns } from '@popcorn-ai/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RunFilters } from '@/components/run-filters';
import { RunsTable } from '@/components/runs-table';
import { Card } from '@/components/ui/card';
import { cursorParam, parseRunFilters, type SearchParams } from '@/lib/run-filters';
import { cn } from '@/lib/utils';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Bloopers' };

/** Failed and flagged runs (FR-2.4). */
export default async function BloopersPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ project: slug }, query] = await Promise.all([params, searchParams]);
  const project = await requireProject(slug);
  const filters = { ...parseRunFilters(query), flagged: true };
  const cursor = cursorParam(query);

  const [page, facets, counts] = await Promise.all([
    listRuns(db, project.id, filters, { cursor, limit: 50 }),
    getRunFacets(db, project.id),
    Promise.all(
      RUN_FLAGS.map(
        async (flag) =>
          [flag, await countRuns(db, project.id, { flags: [flag], excludeEvals: true })] as const,
      ),
    ),
  ]);
  const activeFlag = typeof query.flag === 'string' ? query.flag : undefined;

  return (
    <>
      <PageHeader
        title="Bloopers"
        subtitle="Failed and flagged runs: errors, loops, cost spikes and runs that hit the step limit."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {counts.map(([flag, count]) => (
          <Link
            key={flag}
            href={
              activeFlag === flag
                ? `/p/${project.slug}/bloopers`
                : `/p/${project.slug}/bloopers?flag=${flag}`
            }
            className={cn(
              'rounded-lg border bg-surface px-3 py-2 text-sm hover:border-brand',
              activeFlag === flag && 'border-brand bg-brand-soft',
            )}
          >
            <span className="block text-xs text-muted">{flag.replace('_', ' ')}</span>
            <span className="text-lg font-semibold tabular-nums">{count}</span>
          </Link>
        ))}
      </div>
      <RunFilters facets={facets} showFlag={false} />
      {page.items.length === 0 ? (
        <EmptyState title="No bloopers yet.">Your agent is behaving.</EmptyState>
      ) : (
        <Card>
          <RunsTable project={project.slug} runs={page.items} />
        </Card>
      )}
      <Pagination
        basePath={`/p/${project.slug}/bloopers`}
        params={query}
        nextCursor={page.nextCursor}
        hasPrevious={Boolean(cursor)}
      />
    </>
  );
}

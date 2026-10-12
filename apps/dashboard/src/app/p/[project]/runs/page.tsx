import { countRuns, getRunFacets, listRuns } from '@popcornai/db';
import type { Metadata } from 'next';
import { EmptyState, PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RunFilters } from '@/components/run-filters';
import { RunsTable } from '@/components/runs-table';
import { Card } from '@/components/ui/card';
import { cursorParam, parseRunFilters, type SearchParams } from '@/lib/run-filters';
import { db } from '@/server/db';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Runs' };

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ project: slug }, query] = await Promise.all([params, searchParams]);
  const project = await requireProject(slug);
  const filters = parseRunFilters(query);
  const cursor = cursorParam(query);

  const [page, total, facets] = await Promise.all([
    listRuns(db, project.id, filters, { cursor, limit: 50 }),
    countRuns(db, project.id, filters),
    getRunFacets(db, project.id),
  ]);

  return (
    <>
      <PageHeader
        title="Runs"
        subtitle={`${total.toLocaleString()} run${total === 1 ? '' : 's'}, newest first`}
      />
      <RunFilters facets={facets} />
      {page.items.length === 0 ? (
        <EmptyState title="Nothing showing yet">
          {cursor || Object.values(filters).some((v) => v !== undefined && v !== true)
            ? 'No runs match these filters.'
            : 'Wrap your agent with popcorn.trace() or popcorn.agent() and runs will appear here.'}
        </EmptyState>
      ) : (
        <Card>
          <RunsTable project={project.slug} runs={page.items} />
        </Card>
      )}
      <Pagination
        basePath={`/p/${project.slug}/runs`}
        params={query}
        nextCursor={page.nextCursor}
        hasPrevious={Boolean(cursor)}
      />
    </>
  );
}

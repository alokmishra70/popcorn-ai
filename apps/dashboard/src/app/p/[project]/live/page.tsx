import type { Metadata } from 'next';
import { LiveRuns } from '@/components/live-runs';
import { PageHeader } from '@/components/page-header';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Watch' };

export default async function LivePage({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await requireProject(slug);
  return (
    <>
      <PageHeader
        title="Watch"
        subtitle="Live tail of incoming runs. Same feed as popcorn watch in the terminal."
      />
      <LiveRuns project={project.slug} />
    </>
  );
}

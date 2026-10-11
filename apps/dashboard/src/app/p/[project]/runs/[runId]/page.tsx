import { formatDuration, formatTokens, formatUsd, listSteps } from '@popcorn-ai/core';
import { getRun, listDatasets, listRuns } from '@popcorn-ai/db';
import { GitCompareArrows } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { RewindDialog } from '@/components/rewind-dialog';
import { FlagBadges, StatusBadge } from '@/components/run-badges';
import { RunInspector } from '@/components/run-inspector';
import { SaveTestCaseDialog } from '@/components/save-test-case-dialog';
import { Stat } from '@/components/stat';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { buildConversation } from '@/lib/conversation';
import { formatDateTime, shortId, timeAgo } from '@/lib/utils';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { requireProject } from '@/server/project';

type Params = Promise<{ project: string; runId: string }>;

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { runId } = await params;
  return { title: `Run ${shortId(runId)}` };
}

export default async function RunPage({ params }: { params: Params }) {
  const { project: slug, runId } = await params;
  if (!UUID.test(runId)) notFound();
  const project = await requireProject(slug);
  const detail = await getRun(db, project.id, runId);
  if (!detail) notFound();

  const { run, spans } = detail;
  const [replays, datasets] = await Promise.all([
    listRuns(db, project.id, { replayOf: run.id }, { limit: 20 }),
    env.readOnly ? Promise.resolve([]) : listDatasets(db, project.id),
  ]);
  const steps = listSteps(spans).map((s, index) => ({ index, label: `${s.kind} ${s.name}` }));
  const base = `/p/${project.slug}`;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {run.name}
            <StatusBadge status={run.status} />
            <FlagBadges flags={run.flags} />
          </span>
        }
        subtitle={
          <span title={formatDateTime(run.startedAt)}>
            <span className="font-mono">{run.id}</span> · {timeAgo(run.startedAt)}
          </span>
        }
        actions={
          env.readOnly ? null : (
            <>
              <RewindDialog runId={run.id} steps={steps} models={run.models} />
              <SaveTestCaseDialog
                project={project.slug}
                runId={run.id}
                runName={run.name}
                output={run.output ?? undefined}
                datasets={datasets.map((d) => d.name)}
              />
            </>
          )
        }
      />

      {run.replayOfRunId ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-info/40 bg-info-soft/50 px-4 py-2.5 text-sm">
          <span>
            Rewind of{' '}
            <Link
              className="font-mono text-info hover:underline"
              href={`${base}/runs/${run.replayOfRunId}`}
            >
              {shortId(run.replayOfRunId)}
            </Link>
          </span>
          <Link
            className={buttonVariants({ size: 'sm' })}
            href={`${base}/runs/${run.replayOfRunId}/diff/${run.id}`}
          >
            <GitCompareArrows /> Compare with original
          </Link>
        </div>
      ) : null}

      {run.error ? (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger-soft/50 px-4 py-2.5 text-sm text-danger">
          {run.error}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Duration" value={formatDuration(run.durationMs)} />
        <Stat label="Steps" value={run.stepCount} hint={`${run.spanCount} spans`} />
        <Stat
          label="Tokens"
          value={formatTokens(run.tokensIn + run.tokensOut)}
          hint={`${formatTokens(run.tokensIn)} in · ${formatTokens(run.tokensOut)} out`}
        />
        <Stat label="Cost" value={formatUsd(run.costUsd)} />
        <Stat
          label="Model"
          value={<span className="text-base">{run.models.join(', ') || '-'}</span>}
        />
      </div>

      <RunInspector spans={spans} conversation={buildConversation(spans)} />

      {replays.items.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Rewinds of this run</CardTitle>
          </CardHeader>
          <ul className="divide-y">
            {replays.items.map((replay) => (
              <li
                key={replay.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <StatusBadge status={replay.status} />
                  <Link className="font-mono hover:text-brand" href={`${base}/runs/${replay.id}`}>
                    {shortId(replay.id)}
                  </Link>
                  <span className="text-muted">{timeAgo(replay.startedAt)}</span>
                  <span className="text-muted">{replay.models.join(', ')}</span>
                </span>
                <Link
                  className={buttonVariants({ size: 'sm' })}
                  href={`${base}/runs/${run.id}/diff/${replay.id}`}
                >
                  <GitCompareArrows /> Diff
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

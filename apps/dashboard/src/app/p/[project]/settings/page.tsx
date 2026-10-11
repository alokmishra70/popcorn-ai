import { listApiKeys } from '@popcorn-ai/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiKeys } from '@/components/api-keys';
import { PageHeader } from '@/components/page-header';
import { ProjectSettingsForm } from '@/components/project-settings-form';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { requireProject } from '@/server/project';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: { params: Promise<{ project: string }> }) {
  if (env.readOnly) notFound();
  const { project: slug } = await params;
  const project = await requireProject(slug);
  const keys = await listApiKeys(db, project.id);

  return (
    <>
      <PageHeader title="Settings" subtitle={project.name} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
          </CardHeader>
          <ApiKeys
            project={project.slug}
            apiUrl={env.apiUrl}
            keys={keys.map((k) => ({
              id: k.id,
              name: k.name,
              prefix: k.prefix,
              createdAt: k.createdAt.toISOString(),
              lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
              revokedAt: k.revokedAt?.toISOString() ?? null,
            }))}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bloopers</CardTitle>
          </CardHeader>
          <CardBody>
            <ProjectSettingsForm
              project={project.slug}
              costThresholdUsd={project.costThresholdUsd}
              maxSteps={project.maxSteps}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

import { listProjects } from '@popcornai/db';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/logo';
import { CreateProjectForm } from '@/components/create-project-form';
import { db } from '@/server/db';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const projects = await listProjects(db);
  if (projects[0]) redirect(`/p/${projects[0].slug}/runs`);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <Wordmark className="text-2xl" />
      <div>
        <h1 className="text-xl font-semibold">Create your first project</h1>
        <p className="mt-1 text-sm text-muted">
          One project per agent. You will get an API key for the SDK on the next screen.
        </p>
      </div>
      {env.readOnly ? (
        <p className="text-sm text-muted">This dashboard is read-only and has no projects yet.</p>
      ) : (
        <CreateProjectForm />
      )}
    </main>
  );
}

import { listProjects } from '@popcorn-ai/db';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/logo';
import { ProjectNav } from '@/components/project-nav';
import { ProjectSwitcher } from '@/components/project-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { requireProject } from '@/server/project';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const [project, projects] = await Promise.all([requireProject(slug), listProjects(db)]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-6 border-r bg-surface px-3 py-4 md:flex">
        <Link href="/" className="px-2.5">
          <Wordmark />
        </Link>
        <ProjectSwitcher
          current={project.slug}
          projects={projects.map((p) => ({ slug: p.slug, name: p.name }))}
        />
        <ProjectNav project={project.slug} readOnly={env.readOnly} />
        <div className="mt-auto flex items-center justify-between px-1">
          <Link
            href="/docs"
            className="flex items-center gap-2 px-1.5 text-sm text-muted hover:text-foreground"
          >
            <BookOpen className="size-4" /> Docs
          </Link>
          <ThemeToggle />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b bg-surface px-4 py-3 md:hidden">
          <Wordmark />
          <ThemeToggle />
        </header>
        <div className="border-b bg-surface px-2 py-1.5 md:hidden">
          <ProjectNav project={project.slug} readOnly={env.readOnly} horizontal />
        </div>
        {env.readOnly ? (
          <div className="border-b bg-brand-soft px-6 py-1.5 text-xs text-brand">
            Read-only demo: these are real traces from the dogfood support agent.
          </div>
        ) : null}
        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

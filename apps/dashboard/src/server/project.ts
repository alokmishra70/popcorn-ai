import 'server-only';
import { getProjectBySlug, type Project } from '@popcornai/db';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { db } from './db';

/** Resolves the project in the URL, once per request. */
export const requireProject = cache(async (slug: string): Promise<Project> => {
  const project = await getProjectBySlug(db, slug);
  if (!project) notFound();
  return project;
});

'use client';

import { useRouter } from 'next/navigation';
import { Select } from './ui/input';

export function ProjectSwitcher({
  current,
  projects,
}: {
  current: string;
  projects: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  if (projects.length < 2) {
    return (
      <div className="truncate px-2.5 text-sm font-medium">{projects[0]?.name ?? current}</div>
    );
  }
  return (
    <Select
      aria-label="Project"
      value={current}
      onChange={(event) => router.push(`/p/${event.target.value}/runs`)}
    >
      {projects.map((p) => (
        <option key={p.slug} value={p.slug}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

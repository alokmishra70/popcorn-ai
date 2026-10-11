'use client';

import {
  BarChart3,
  Clapperboard,
  Database,
  FlaskConical,
  KeyRound,
  Radio,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const items = [
  { href: 'runs', label: 'Runs', icon: Clapperboard },
  { href: 'bloopers', label: 'Bloopers', icon: TriangleAlert },
  { href: 'live', label: 'Watch', icon: Radio },
  { href: 'overview', label: 'Box Office', icon: BarChart3 },
  { href: 'datasets', label: 'Datasets', icon: Database },
  { href: 'reviews', label: 'Reviews', icon: FlaskConical },
  { href: 'settings', label: 'Settings', icon: KeyRound, hiddenWhenReadOnly: true },
];

export function ProjectNav({
  project,
  readOnly,
  horizontal = false,
}: {
  project: string;
  readOnly: boolean;
  horizontal?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Project"
      className={cn('flex gap-0.5', horizontal ? 'overflow-x-auto' : 'flex-col')}
    >
      {items
        .filter((item) => !(readOnly && item.hiddenWhenReadOnly))
        .map(({ href, label, icon: Icon }) => {
          const target = `/p/${project}/${href}`;
          const active = pathname === target || pathname.startsWith(`${target}/`);
          return (
            <Link
              key={href}
              href={target}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-foreground',
                active && 'bg-surface-muted font-medium text-foreground',
              )}
            >
              <Icon className={cn('size-4', active && 'text-brand')} />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}

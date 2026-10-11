import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-surface px-4 py-3', className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

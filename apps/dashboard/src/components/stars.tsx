import { cn } from '@/lib/utils';

/** Reviews: pass rate as a five-star rating, with the exact score beside it. */
export function Stars({ passRate, className }: { passRate: number; className?: string }) {
  const filled = Math.round(passRate * 5);
  return (
    <span
      className={cn('tracking-tight text-warn', className)}
      aria-label={`${Math.round(passRate * 100)}% passing`}
    >
      {'★'.repeat(filled)}
      <span className="text-border">{'★'.repeat(5 - filled)}</span>
    </span>
  );
}

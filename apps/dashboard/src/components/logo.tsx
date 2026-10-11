import { cn } from '@/lib/utils';

/** Striped popcorn bucket with one unpopped kernel: the bug. Legible down to 16px. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-6', className)} aria-hidden="true">
      <circle cx="10" cy="9" r="4.5" fill="#fff4dc" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="16" cy="7" r="5" fill="#fff4dc" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="22" cy="9" r="4.5" fill="#fff4dc" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 12h22l-2.6 17H7.6z" fill="var(--brand)" />
      <path d="M9.6 12h2l1.3 17h-1.9zM15 12h2v17h-2zM20.4 12h2L21 29h-1.9z" fill="#fff" />
      <ellipse cx="24.5" cy="5.5" rx="2" ry="1.5" fill="#a0622a" transform="rotate(-25 24.5 5.5)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-lg font-extrabold tracking-tight">popcorn</span>
    </span>
  );
}

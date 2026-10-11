import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border bg-surface px-2.5 text-sm placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea className={cn(field, 'min-h-24 py-2 font-mono text-xs', className)} {...props} />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(field, 'h-9 pr-8', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-xs font-medium text-muted', className)} {...props} />;
}

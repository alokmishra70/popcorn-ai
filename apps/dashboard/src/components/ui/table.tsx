import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'border-b px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b px-3 py-2 align-middle', className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-surface-muted/60', className)} {...props} />;
}

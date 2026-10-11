import Link from 'next/link';
import { buttonVariants } from './ui/button';

/** Keyset pagination: "Newer" goes back to the first page, "Older" follows the cursor. */
export function Pagination({
  basePath,
  params,
  nextCursor,
  hasPrevious,
}: {
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  nextCursor: string | null;
  hasPrevious: boolean;
}) {
  const query = (cursor: string | null) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'cursor' && typeof value === 'string' && value) next.set(key, value);
    }
    if (cursor) next.set('cursor', cursor);
    return next.size ? `${basePath}?${next}` : basePath;
  };

  if (!nextCursor && !hasPrevious) return null;
  return (
    <div className="mt-4 flex justify-end gap-2">
      {hasPrevious ? (
        <Link href={query(null)} className={buttonVariants({ size: 'sm' })}>
          Newest
        </Link>
      ) : null}
      {nextCursor ? (
        <Link href={query(nextCursor)} className={buttonVariants({ size: 'sm' })}>
          Older
        </Link>
      ) : null}
    </div>
  );
}

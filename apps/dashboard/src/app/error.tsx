'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading this page.</h1>
      <p className="max-w-md text-sm text-muted">
        {error.digest ? `Error reference ${error.digest}. ` : ''}Check that the database is
        reachable, then try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

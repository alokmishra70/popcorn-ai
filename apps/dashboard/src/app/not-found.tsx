import Link from 'next/link';
import { LogoMark } from '@/components/logo';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="font-display text-2xl font-extrabold">This scene was cut.</h1>
      <p className="text-sm text-muted">The page or run you are looking for does not exist.</p>
      <Link href="/" className="text-sm text-brand hover:underline">
        Back to the dashboard
      </Link>
    </main>
  );
}

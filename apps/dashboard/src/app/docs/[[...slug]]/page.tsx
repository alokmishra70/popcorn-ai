import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Wordmark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { docsNav, readDoc } from '@/server/docs';

type Params = Promise<{ slug?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = (await params).slug?.[0] ?? 'quickstart';
  return { title: docsNav.find((d) => d.slug === slug)?.title ?? 'Docs' };
}

export default async function DocsPage({ params }: { params: Params }) {
  const { slug: parts } = await params;
  if (parts && parts.length > 1) notFound();
  const slug = parts?.[0] ?? 'quickstart';
  const content = await readDoc(slug);
  if (content === null) notFound();

  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-6 py-8">
      <aside className="sticky top-8 hidden h-fit w-48 shrink-0 md:block">
        <Link href="/">
          <Wordmark />
        </Link>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Docs">
          {docsNav.map((doc) => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              aria-current={doc.slug === slug ? 'page' : undefined}
              className={cn(
                'rounded px-2 py-1 text-sm text-muted hover:text-foreground',
                doc.slug === slug && 'bg-surface-muted font-medium text-foreground',
              )}
            >
              {doc.title}
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          <ThemeToggle />
        </div>
      </aside>
      <article className="prose-popcorn min-w-0 flex-1">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) =>
              href?.endsWith('.md') && !href.startsWith('http') ? (
                <Link href={`/docs/${href.replace(/^\.\//, '').replace(/\.md$/, '')}`}>
                  {children}
                </Link>
              ) : (
                <a href={href}>{children}</a>
              ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

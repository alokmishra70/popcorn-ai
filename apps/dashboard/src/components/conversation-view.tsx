import { Brain, Wrench } from 'lucide-react';
import type { ChatItem } from '@/lib/conversation';
import { cn } from '@/lib/utils';
import { JsonView } from './json-view';

/** The run as a chat thread, tool calls inline (FR-2.2). */
export function ConversationView({ items }: { items: ChatItem[] }) {
  if (items.length === 0)
    return <p className="p-4 text-sm text-muted">No messages were recorded for this run.</p>;

  return (
    <ol className="flex flex-col gap-3 p-4">
      {items.map((item, index) => (
        <li key={index} className={cn('flex', alignment(item))}>
          <ChatEntry item={item} />
        </li>
      ))}
    </ol>
  );
}

function alignment(item: ChatItem): string {
  if (item.kind === 'system') return 'justify-center';
  if (item.kind === 'tool_result' || (item.kind === 'message' && item.role === 'user'))
    return 'justify-start';
  return 'justify-end';
}

function ChatEntry({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'system':
      return (
        <details className="w-full max-w-3xl rounded-md border border-dashed px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer">System prompt</summary>
          <p className="mt-2 whitespace-pre-wrap">{item.text}</p>
        </details>
      );
    case 'message':
      return (
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
            item.role === 'user'
              ? 'rounded-bl-sm bg-surface-muted'
              : 'rounded-br-sm bg-brand text-brand-foreground',
          )}
        >
          {item.text}
        </div>
      );
    case 'thinking':
      return (
        <details className="max-w-[75%] rounded-md border px-3 py-2 text-xs text-muted">
          <summary className="flex cursor-pointer items-center gap-1.5">
            <Brain className="size-3.5" /> Thinking
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{item.text}</p>
        </details>
      );
    case 'tool_call':
      return (
        <div className="w-full max-w-[75%] rounded-md border border-info/40 bg-info-soft/40 px-3 py-2">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-info">
            <Wrench className="size-3.5" /> {item.name}
          </p>
          <JsonView value={item.input} />
        </div>
      );
    case 'tool_result':
      return (
        <div
          className={cn(
            'w-full max-w-[75%] rounded-md border px-3 py-2',
            item.isError ? 'border-danger/40 bg-danger-soft/40' : 'bg-surface',
          )}
        >
          <p
            className={cn(
              'mb-1.5 text-xs font-medium',
              item.isError ? 'text-danger' : 'text-muted',
            )}
          >
            {item.isError ? 'error from ' : 'result from '}
            {item.name ?? 'tool'}
          </p>
          <JsonView value={item.output} />
        </div>
      );
  }
}

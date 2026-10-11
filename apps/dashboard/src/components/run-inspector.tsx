'use client';

import type { StoredSpan } from '@popcorn-ai/core';
import { useMemo, useState } from 'react';
import type { ChatItem } from '@/lib/conversation';
import { computeWaterfall } from '@/lib/waterfall';
import { ConversationView } from './conversation-view';
import { SpanDetail } from './span-detail';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { WaterfallView } from './waterfall';

export function RunInspector({
  spans,
  conversation,
}: {
  spans: StoredSpan[];
  conversation: ChatItem[];
}) {
  const waterfall = useMemo(() => computeWaterfall(spans), [spans]);
  const firstInteresting =
    spans.find((s) => s.status === 'error') ?? spans.find((s) => s.parentId === null) ?? spans[0];
  const [selectedId, setSelectedId] = useState<string | null>(firstInteresting?.id ?? null);
  const selected = spans.find((s) => s.id === selectedId);

  return (
    <Tabs defaultValue="scenes">
      <TabsList className="mb-4">
        <TabsTrigger value="scenes">Scene by Scene</TabsTrigger>
        <TabsTrigger value="conversation">Conversation</TabsTrigger>
      </TabsList>
      <TabsContent
        value="scenes"
        className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]"
      >
        <Card className="max-h-[75vh] overflow-auto">
          <WaterfallView waterfall={waterfall} selectedId={selectedId} onSelect={setSelectedId} />
        </Card>
        <Card className="max-h-[75vh] overflow-auto p-4">
          {selected ? (
            <SpanDetail span={selected} runStartMs={waterfall.startMs} />
          ) : (
            <p className="text-sm text-muted">Select a span.</p>
          )}
        </Card>
      </TabsContent>
      <TabsContent value="conversation">
        <Card>
          <ConversationView items={conversation} />
        </Card>
      </TabsContent>
    </Tabs>
  );
}

import type { SpanKind } from '@popcorn-ai/core';
import { Bot, Clapperboard, Footprints, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export const kindStyles: Record<SpanKind, { bar: string; icon: typeof Bot; label: string }> = {
  agent: { bar: 'bg-foreground/70', icon: Clapperboard, label: 'agent' },
  llm: { bar: 'bg-brand', icon: Bot, label: 'llm' },
  tool: { bar: 'bg-info', icon: Wrench, label: 'tool' },
  step: { bar: 'bg-warn', icon: Footprints, label: 'step' },
};

export function KindIcon({ kind, className }: { kind: SpanKind; className?: string }) {
  const Icon = kindStyles[kind].icon;
  return <Icon className={cn('size-3.5 shrink-0', className)} aria-label={kind} />;
}

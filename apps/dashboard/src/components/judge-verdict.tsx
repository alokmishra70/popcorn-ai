'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useOptimistic, useTransition } from 'react';
import { setJudgeVerdictAction } from '@/server/actions';
import { cn } from '@/lib/utils';

/** FR-4.7: a human marks the judge's verdict right or wrong; agreement is tracked per project. */
export function JudgeVerdict({
  project,
  evalRunId,
  resultId,
  correct,
  readOnly,
}: {
  project: string;
  evalRunId: string;
  resultId: string;
  correct: boolean | null;
  readOnly: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(correct);
  const [, startTransition] = useTransition();

  const mark = (value: boolean) =>
    startTransition(async () => {
      const next = optimistic === value ? null : value;
      setOptimistic(next);
      await setJudgeVerdictAction(project, evalRunId, resultId, next);
    });

  if (readOnly) return null;
  return (
    <span className="flex items-center gap-0.5" role="group" aria-label="Was the judge right?">
      <button
        type="button"
        onClick={() => mark(true)}
        aria-pressed={optimistic === true}
        title="Judge was right"
        className={cn(
          'rounded p-1 text-muted hover:bg-surface-muted',
          optimistic === true && 'bg-ok-soft text-ok',
        )}
      >
        <ThumbsUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => mark(false)}
        aria-pressed={optimistic === false}
        title="Judge was wrong"
        className={cn(
          'rounded p-1 text-muted hover:bg-surface-muted',
          optimistic === false && 'bg-danger-soft text-danger',
        )}
      >
        <ThumbsDown className="size-3.5" />
      </button>
    </span>
  );
}

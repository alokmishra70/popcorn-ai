import type { RunFlag, RunStatus } from '@popcornai/core';
import { Badge, type BadgeTone } from './ui/badge';

const statusTone: Record<RunStatus, BadgeTone> = { ok: 'ok', error: 'danger', running: 'info' };

export function StatusBadge({ status }: { status: RunStatus }) {
  return <Badge tone={statusTone[status]}>{status === 'running' ? 'running' : status}</Badge>;
}

const flagLabel: Record<RunFlag, string> = {
  error: 'error',
  loop: 'loop',
  cost_spike: 'cost spike',
  max_steps: 'max steps',
};

export function FlagBadges({ flags }: { flags: RunFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag} tone={flag === 'error' ? 'danger' : 'warn'}>
          {flagLabel[flag]}
        </Badge>
      ))}
    </span>
  );
}

'use client';

import { useActionState } from 'react';
import { updateSettingsAction } from '@/server/actions';
import { Button } from './ui/button';
import { Input, Label } from './ui/input';

export function ProjectSettingsForm({
  project,
  costThresholdUsd,
  maxSteps,
}: {
  project: string;
  costThresholdUsd: number;
  maxSteps: number;
}) {
  const [state, action, pending] = useActionState(updateSettingsAction.bind(null, project), null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Runs over these limits are flagged and show up under Bloopers. Applies to new runs.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="costThresholdUsd">Cost spike above (USD per run)</Label>
        <Input
          id="costThresholdUsd"
          name="costThresholdUsd"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={costThresholdUsd}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="maxSteps">Max steps (LLM and tool calls)</Label>
        <Input id="maxSteps" name="maxSteps" type="number" min="1" defaultValue={maxSteps} />
      </div>
      {state ? (
        <p className={state.ok ? 'text-sm text-ok' : 'text-sm text-danger'}>
          {state.ok ? 'Saved.' : state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}

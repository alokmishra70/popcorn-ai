'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { CopyButton } from './copy-button';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Input, Label, Select } from './ui/input';

interface StepOption {
  index: number;
  label: string;
}

/**
 * Rewind runs the agent's own code, which lives with the user, not the
 * dashboard. This builds the exact CLI command for the chosen step and edits.
 */
export function RewindDialog({
  runId,
  steps,
  models,
}: {
  runId: string;
  steps: StepOption[];
  models: string[];
}) {
  const [fromStep, setFromStep] = useState(0);
  const [model, setModel] = useState('');
  const [systemFile, setSystemFile] = useState('');
  const [onMiss, setOnMiss] = useState<'fail' | 'live'>('fail');

  const command = [
    'npx popcorn rewind',
    runId,
    fromStep > 0 ? `--from-step ${fromStep}` : '',
    model ? `--model ${model}` : '',
    systemFile ? `--system-file ${systemFile}` : '',
    onMiss === 'live' ? '--on-miss live' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <RotateCcw /> Rewind
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Rewind this run"
        description="Re-run the agent with recorded tool outputs. Model calls from the chosen step go live, so you can test a prompt or model change without touching real tools."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from-step">Go live from step</Label>
            <Select
              id="from-step"
              value={fromStep}
              onChange={(e) => setFromStep(Number(e.target.value))}
            >
              {steps.map((step) => (
                <option key={step.index} value={step.index}>
                  {step.index}. {step.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Model (optional)</Label>
            <Input
              id="model"
              list="rewind-models"
              value={model}
              onChange={(e) => setModel(e.target.value.trim())}
              placeholder="keep the recorded model"
            />
            <datalist id="rewind-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="system-file">New system prompt file (optional)</Label>
            <Input
              id="system-file"
              value={systemFile}
              onChange={(e) => setSystemFile(e.target.value.trim())}
              placeholder="prompts/system-v2.md"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="on-miss">When a tool gets new arguments</Label>
            <Select
              id="on-miss"
              value={onMiss}
              onChange={(e) => setOnMiss(e.target.value as 'fail' | 'live')}
            >
              <option value="fail">Fail the replay (no real tool calls)</option>
              <option value="live">Call the real tool</option>
            </Select>
          </div>
          <div className="mt-1 flex items-center gap-2 rounded-md border bg-surface-muted p-2 font-mono text-xs">
            <code className="flex-1 break-all">{command}</code>
            <CopyButton text={command} label="Copy command" />
          </div>
          <p className="text-xs text-muted">
            Run it where your popcorn.config.ts lives. The replay appears here, linked to this run,
            with a diff.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { saveTestCaseAction } from '@/server/actions';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Input, Label, Textarea } from './ui/input';

const exampleChecks = (output: unknown) => {
  const checks: unknown[] = [{ type: 'max_steps', max: 10 }];
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const [key, value] = Object.entries(output)[0] ?? [];
    if (key && (typeof value === 'string' || typeof value === 'number'))
      checks.unshift({ type: 'output_equals', path: key, value });
  }
  return JSON.stringify(checks, null, 2);
};

/** FR-4.1: turn this run into a test case. The run's input becomes the case input. */
export function SaveTestCaseDialog({
  project,
  runId,
  runName,
  output,
  datasets,
}: {
  project: string;
  runId: string;
  runName: string;
  output: unknown;
  datasets: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = (form: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await saveTestCaseAction(project, runId, {
        dataset: String(form.get('dataset') ?? ''),
        name: String(form.get('name') ?? ''),
        expected: String(form.get('expected') ?? ''),
        checks: String(form.get('checks') ?? ''),
      });
      if (result.ok) setSaved(result.data.dataset);
      else setError(result.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next || setSaved(null))}>
      <DialogTrigger asChild>
        <Button>
          <FlaskConical /> Save as test case
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Save as test case"
        description="The run's input is reused; checks run against every future run of the case."
      >
        {saved ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>Added to {saved}.</p>
            <Link
              className="text-brand hover:underline"
              href={`/p/${project}/datasets/${encodeURIComponent(saved)}`}
            >
              Open dataset
            </Link>
          </div>
        ) : (
          <form action={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dataset">Dataset</Label>
              <Input
                id="dataset"
                name="dataset"
                list="datasets"
                required
                defaultValue={datasets[0] ?? `${runName}-v1`}
              />
              <datalist id="datasets">
                {datasets.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-name">Name (optional)</Label>
              <Input id="case-name" name="name" placeholder={`${runName} ${runId.slice(0, 8)}`} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expected">Expected outcome (JSON, shown to the judge)</Label>
              <Textarea
                id="expected"
                name="expected"
                defaultValue={output === undefined ? '' : JSON.stringify(output, null, 2)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checks">Checks (JSON array)</Label>
              <Textarea
                id="checks"
                name="checks"
                className="min-h-32"
                defaultValue={exampleChecks(output)}
              />
              <p className="text-xs text-muted">
                Types: tool_called, tool_not_called, tool_args_schema, output_contains,
                output_matches, output_equals, valid_json, max_steps, max_cost, llm_judge.
              </p>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving...' : 'Save test case'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

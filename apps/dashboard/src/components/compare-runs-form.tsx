'use client';

import { GitCompareArrows } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
import { Select } from './ui/input';

/** Pick any two eval runs, e.g. the same suite on two models, and compare them (FR-4.5). */
export function CompareRunsForm({
  project,
  runs,
}: {
  project: string;
  runs: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(runs[1]?.id ?? '');
  const [current, setCurrent] = useState(runs[0]?.id ?? '');
  if (runs.length < 2) return null;

  return (
    <form
      className="mb-4 flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/p/${project}/reviews/compare?baseline=${baseline}&current=${current}`);
      }}
    >
      <span className="text-muted">Compare</span>
      <Select
        aria-label="Baseline eval run"
        value={baseline}
        onChange={(e) => setBaseline(e.target.value)}
        className="w-auto max-w-80"
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
      <span className="text-muted">with</span>
      <Select
        aria-label="Eval run to compare"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-auto max-w-80"
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={baseline === current}>
        <GitCompareArrows /> Compare
      </Button>
    </form>
  );
}

'use client';

import { RUN_FLAGS } from '@popcornai/core';
import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Button } from './ui/button';
import { Input, Select } from './ui/input';

interface Facets {
  names: string[];
  models: string[];
  tools: string[];
}

const FIELDS = ['q', 'status', 'flag', 'name', 'model', 'tool', 'from', 'to', 'minCost'] as const;

export function RunFilters({ facets, showFlag = true }: { facets: Facets; showFlag?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = FIELDS.some((f) => params.get(f));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of FIELDS) {
      const value = String(form.get(field) ?? '').trim();
      if (value) next.set(field, value);
    }
    router.push(`${pathname}${next.size ? `?${next}` : ''}`);
  };

  const value = (field: string) => params.get(field) ?? '';

  return (
    <form
      onSubmit={submit}
      className="mb-4 flex flex-wrap items-center gap-2"
      role="search"
      key={params.toString()}
    >
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" />
        <Input
          name="q"
          defaultValue={value('q')}
          placeholder="Search inputs and outputs"
          className="pl-8"
          aria-label="Search"
        />
      </div>
      <Select name="status" defaultValue={value('status')} className="w-auto" aria-label="Status">
        <option value="">Any status</option>
        <option value="ok">ok</option>
        <option value="error">error</option>
        <option value="running">running</option>
      </Select>
      {showFlag ? (
        <Select name="flag" defaultValue={value('flag')} className="w-auto" aria-label="Flag">
          <option value="">Any flag</option>
          {RUN_FLAGS.map((f) => (
            <option key={f} value={f}>
              {f.replace('_', ' ')}
            </option>
          ))}
        </Select>
      ) : null}
      <FacetSelect name="name" label="Any agent" options={facets.names} value={value('name')} />
      <FacetSelect name="model" label="Any model" options={facets.models} value={value('model')} />
      <FacetSelect name="tool" label="Any tool" options={facets.tools} value={value('tool')} />
      <Input
        type="date"
        name="from"
        defaultValue={value('from')}
        className="w-auto"
        aria-label="From date"
      />
      <Input
        type="date"
        name="to"
        defaultValue={value('to')}
        className="w-auto"
        aria-label="To date"
      />
      <Input
        name="minCost"
        defaultValue={value('minCost')}
        inputMode="decimal"
        placeholder="Cost above $"
        className="w-28"
        aria-label="Minimum cost in USD"
      />
      <Button type="submit" variant="primary">
        Apply
      </Button>
      {active ? (
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          <X /> Clear
        </Button>
      ) : null}
    </form>
  );
}

function FacetSelect({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: string[];
  value: string;
}) {
  if (options.length === 0) return null;
  return (
    <Select name={name} defaultValue={value} className="w-auto max-w-48" aria-label={label}>
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}

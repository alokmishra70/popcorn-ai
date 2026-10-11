import { RUN_FLAGS, RUN_STATUSES, type RunFlag, type RunStatus } from '@popcorn-ai/core';
import type { RunFilters } from '@popcorn-ai/db';

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** URL search params -> repository filters (FR-2.3). Invalid values are ignored, not errors. */
export function parseRunFilters(params: SearchParams): RunFilters {
  const status = first(params.status);
  const flag = first(params.flag);
  const minCost = Number(first(params.minCost));
  return {
    status: RUN_STATUSES.includes(status as RunStatus) ? (status as RunStatus) : undefined,
    flags: RUN_FLAGS.includes(flag as RunFlag) ? [flag as RunFlag] : undefined,
    model: first(params.model),
    tool: first(params.tool),
    name: first(params.name),
    search: first(params.q),
    from: parseDate(first(params.from)),
    to: parseDate(first(params.to), true),
    minCostUsd: Number.isFinite(minCost) && minCost > 0 ? minCost : undefined,
    excludeEvals: first(params.evals) !== 'include',
  };
}

export const cursorParam = (params: SearchParams) => first(params.cursor) ?? null;

import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { runs, spans } from '../schema';

export interface DailyStats {
  day: string;
  runs: number;
  errors: number;
  errorRate: number;
  p50Ms: number | null;
  p95Ms: number | null;
  costUsd: number;
  tokens: number;
}

export interface OverviewTotals {
  runs: number;
  errors: number;
  flagged: number;
  costUsd: number;
  tokens: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

/** Box Office: runs per day, error rate, latency percentiles and cost per day (FR-2.5). */
export async function getDailyStats(
  db: Database,
  projectId: string,
  days = 14,
): Promise<DailyStats[]> {
  const rows = await db.execute<{
    day: string;
    runs: number;
    errors: number;
    p50: number | null;
    p95: number | null;
    cost: number;
    tokens: number;
  }>(sql`
    with days as (
      select generate_series(
        date_trunc('day', now() at time zone 'utc') - make_interval(days => ${days - 1}),
        date_trunc('day', now() at time zone 'utc'),
        interval '1 day'
      ) as day
    )
    select
      to_char(days.day, 'YYYY-MM-DD') as day,
      count(r.id)::int as runs,
      count(r.id) filter (where r.status = 'error')::int as errors,
      percentile_cont(0.5) within group (order by r.duration_ms) as p50,
      percentile_cont(0.95) within group (order by r.duration_ms) as p95,
      coalesce(sum(r.cost_usd), 0)::float8 as cost,
      coalesce(sum(r.tokens_in + r.tokens_out), 0)::int as tokens
    from days
    left join ${runs} r
      on r.project_id = ${projectId}
     and r.eval_run_id is null
     and date_trunc('day', r.started_at at time zone 'utc') = days.day
    group by days.day
    order by days.day
  `);

  return rows.map((row) => ({
    day: row.day,
    runs: row.runs,
    errors: row.errors,
    errorRate: row.runs ? row.errors / row.runs : 0,
    p50Ms: row.p50,
    p95Ms: row.p95,
    costUsd: Math.round(row.cost * 1e6) / 1e6,
    tokens: row.tokens,
  }));
}

export async function getOverviewTotals(
  db: Database,
  projectId: string,
  days = 14,
): Promise<OverviewTotals> {
  const [row] = await db.execute<{
    runs: number;
    errors: number;
    flagged: number;
    cost: number;
    tokens: number;
    p50: number | null;
    p95: number | null;
  }>(sql`
    select
      count(*)::int as runs,
      count(*) filter (where status = 'error')::int as errors,
      count(*) filter (where cardinality(flags) > 0)::int as flagged,
      coalesce(sum(cost_usd), 0)::float8 as cost,
      coalesce(sum(tokens_in + tokens_out), 0)::int as tokens,
      percentile_cont(0.5) within group (order by duration_ms) as p50,
      percentile_cont(0.95) within group (order by duration_ms) as p95
    from ${runs}
    where project_id = ${projectId}
      and eval_run_id is null
      and started_at > now() - make_interval(days => ${days})
  `);
  return {
    runs: row?.runs ?? 0,
    errors: row?.errors ?? 0,
    flagged: row?.flagged ?? 0,
    costUsd: row?.cost ?? 0,
    tokens: row?.tokens ?? 0,
    p50Ms: row?.p50 ?? null,
    p95Ms: row?.p95 ?? null,
  };
}

export interface ModelStats {
  model: string;
  calls: number;
  tokens: number;
  costUsd: number;
  p95Ms: number | null;
}

export async function getModelStats(
  db: Database,
  projectId: string,
  days = 14,
): Promise<ModelStats[]> {
  const rows = await db.execute<{
    model: string;
    calls: number;
    tokens: number;
    cost: number;
    p95: number | null;
  }>(sql`
    select
      model,
      count(*)::int as calls,
      coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0) + coalesce(cache_read_tokens, 0)), 0)::int as tokens,
      coalesce(sum(cost_usd), 0)::float8 as cost,
      percentile_cont(0.95) within group (order by end_ms - start_ms) as p95
    from ${spans}
    where project_id = ${projectId}
      and kind = 'llm'
      and model is not null
      and created_at > now() - make_interval(days => ${days})
    group by model
    order by cost desc
  `);
  return rows.map((r) => ({
    model: r.model,
    calls: r.calls,
    tokens: r.tokens,
    costUsd: r.cost,
    p95Ms: r.p95,
  }));
}

export interface ToolStats {
  tool: string;
  calls: number;
  errors: number;
  p95Ms: number | null;
  cacheHits: number;
  cacheLookups: number;
}

/** Per-tool call counts, error rates and cache hit rate (FR-3.6). */
export async function getToolStats(
  db: Database,
  projectId: string,
  days = 14,
): Promise<ToolStats[]> {
  const rows = await db.execute<{
    tool: string;
    calls: number;
    errors: number;
    p95: number | null;
    hits: number;
    lookups: number;
  }>(sql`
    select
      name as tool,
      count(*)::int as calls,
      count(*) filter (where status = 'error')::int as errors,
      percentile_cont(0.95) within group (order by end_ms - start_ms) as p95,
      count(*) filter (where attributes->>'popcorn.cache' = 'hit')::int as hits,
      count(*) filter (where attributes ? 'popcorn.cache')::int as lookups
    from ${spans}
    where project_id = ${projectId}
      and kind = 'tool'
      and created_at > now() - make_interval(days => ${days})
    group by name
    order by calls desc
  `);
  return rows.map((r) => ({
    tool: r.tool,
    calls: r.calls,
    errors: r.errors,
    p95Ms: r.p95,
    cacheHits: r.hits,
    cacheLookups: r.lookups,
  }));
}

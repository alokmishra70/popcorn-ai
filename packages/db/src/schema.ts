import type {
  CheckResult,
  RunFlag,
  RunStatus,
  SpanError,
  SpanKind,
  SpanStatus,
} from '@popcorn-ai/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const tsz = (name: string) => timestamp(name, { withTimezone: true });

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  costThresholdUsd: doublePrecision('cost_threshold_usd').notNull().default(0.5),
  maxSteps: integer('max_steps').notNull().default(25),
  createdAt: createdAt(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** First characters of the key, shown in the UI so keys can be told apart. */
    prefix: text('prefix').notNull(),
    /** sha256 of the full key. The key itself is never stored. */
    hash: text('hash').notNull().unique(),
    createdAt: createdAt(),
    lastUsedAt: tsz('last_used_at'),
    revokedAt: tsz('revoked_at'),
  },
  (t) => [index('api_keys_project_idx').on(t.projectId)],
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').$type<RunStatus>().notNull(),
    startedAt: tsz('started_at').notNull(),
    durationMs: doublePrecision('duration_ms'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    flags: text('flags')
      .array()
      .$type<RunFlag[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    spanCount: integer('span_count').notNull().default(0),
    stepCount: integer('step_count').notNull().default(0),
    models: text('models')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tools: text('tools')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    input: jsonb('input'),
    output: jsonb('output'),
    error: text('error'),
    replayOfRunId: uuid('replay_of_run_id'),
    evalRunId: uuid('eval_run_id'),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('runs_project_started_idx').on(t.projectId, t.startedAt.desc()),
    index('runs_flags_idx').using('gin', t.flags),
    index('runs_models_idx').using('gin', t.models),
    index('runs_tools_idx').using('gin', t.tools),
    index('runs_replay_of_idx').on(t.replayOfRunId),
  ],
);

export const spans = pgTable(
  'spans',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    kind: text('kind').$type<SpanKind>().notNull(),
    name: text('name').notNull(),
    status: text('status').$type<SpanStatus>().notNull(),
    /** Epoch milliseconds, sub-millisecond precision kept for the waterfall. */
    startMs: doublePrecision('start_ms').notNull(),
    endMs: doublePrecision('end_ms').notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    error: jsonb('error').$type<SpanError>(),
    provider: text('provider'),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    costUsd: doublePrecision('cost_usd'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('spans_run_idx').on(t.runId, t.startMs),
    index('spans_project_kind_idx').on(t.projectId, t.kind, t.name),
    index('spans_search_idx').using(
      'gin',
      sql`to_tsvector('simple', left(coalesce(${t.input}::text, '') || ' ' || coalesce(${t.output}::text, ''), 200000))`,
    ),
  ],
);

export const fixtures = pgTable(
  'fixtures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    spanId: uuid('span_id').notNull().unique(),
    toolName: text('tool_name').notNull(),
    argsHash: text('args_hash').notNull(),
    result: jsonb('result'),
    isError: boolean('is_error').notNull().default(false),
    startMs: doublePrecision('start_ms').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('fixtures_lookup_idx').on(t.runId, t.toolName, t.argsHash)],
);

export const datasets = pgTable(
  'datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The agent whose runs this suite re-executes; the name used with popcorn.agent(). */
    agentName: text('agent_name'),
    description: text('description'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('datasets_project_name_idx').on(t.projectId, t.name)],
);

export const testCases = pgTable(
  'test_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    sourceRunId: uuid('source_run_id'),
    name: text('name').notNull(),
    input: jsonb('input'),
    expected: jsonb('expected'),
    checks: jsonb('checks')
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('test_cases_dataset_idx').on(t.datasetId)],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    gitSha: text('git_sha'),
    gitBranch: text('git_branch'),
    label: text('label'),
    model: text('model'),
    promptHash: text('prompt_hash'),
    repeat: integer('repeat').notNull().default(1),
    startedAt: tsz('started_at').notNull(),
    finishedAt: tsz('finished_at'),
    total: integer('total').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    passRate: real('pass_rate').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    p95LatencyMs: doublePrecision('p95_latency_ms'),
    createdAt: createdAt(),
  },
  (t) => [index('eval_runs_dataset_idx').on(t.datasetId, t.startedAt.desc())],
);

export const evalResults = pgTable(
  'eval_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    evalRunId: uuid('eval_run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    testCaseId: uuid('test_case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    runId: uuid('run_id'),
    attempt: integer('attempt').notNull().default(0),
    passed: boolean('passed').notNull(),
    checkResults: jsonb('check_results').$type<CheckResult[]>().notNull(),
    judgeReason: text('judge_reason'),
    /** Human review of the judge's verdict (FR-4.7): true = judge was right, false = wrong. */
    judgeVerdictCorrect: boolean('judge_verdict_correct'),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    durationMs: doublePrecision('duration_ms').notNull().default(0),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('eval_results_run_idx').on(t.evalRunId),
    index('eval_results_case_idx').on(t.testCaseId),
  ],
);

export type Project = typeof projects.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type SpanRow = typeof spans.$inferSelect;
export type FixtureRow = typeof fixtures.$inferSelect;
export type Dataset = typeof datasets.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type EvalRun = typeof evalRuns.$inferSelect;
export type EvalResult = typeof evalResults.$inferSelect;

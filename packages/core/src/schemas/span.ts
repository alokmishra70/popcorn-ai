import { z } from 'zod';

export const SPAN_KINDS = ['agent', 'llm', 'tool', 'step'] as const;
export type SpanKind = (typeof SPAN_KINDS)[number];

export const SPAN_STATUSES = ['ok', 'error'] as const;
export type SpanStatus = (typeof SPAN_STATUSES)[number];

/** Upper bound on spans in one ingest request. Keeps request bodies and insert statements bounded. */
export const MAX_SPANS_PER_BATCH = 1000;

const uuid = z.uuid();

export const spanErrorSchema = z.object({
  message: z.string().max(10_000),
  type: z.string().max(200).optional(),
  stack: z.string().max(20_000).optional(),
});
export type SpanError = z.infer<typeof spanErrorSchema>;

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

/**
 * Well-known attribute keys. Attributes are an open map, but these are the ones
 * Popcorn itself reads back.
 */
export const SpanAttr = {
  ReplayOf: 'popcorn.replay_of',
  ReplayFromStep: 'popcorn.replay_from_step',
  Fixture: 'popcorn.fixture',
  Cache: 'popcorn.cache',
  ArgsHash: 'popcorn.args_hash',
  EvalRunId: 'popcorn.eval_run_id',
  TestCaseId: 'popcorn.test_case_id',
  MaxStepsHit: 'popcorn.max_steps_hit',
  StopReason: 'popcorn.stop_reason',
  Streamed: 'popcorn.streamed',
} as const;

export type FixtureOutcome = 'hit' | 'miss' | 'override';

/** The wire format the SDK sends to `POST /v1/spans`. Times are epoch milliseconds. */
export const spanSchema = z
  .object({
    id: uuid,
    runId: uuid,
    parentId: uuid.nullable(),
    kind: z.enum(SPAN_KINDS),
    name: z.string().min(1).max(200),
    startTime: z.number().nonnegative(),
    endTime: z.number().nonnegative(),
    status: z.enum(SPAN_STATUSES),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: spanErrorSchema.optional(),
    provider: z.string().max(50).optional(),
    model: z.string().max(200).optional(),
    usage: tokenUsageSchema.optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((span) => span.endTime >= span.startTime, {
    message: 'endTime must not be before startTime',
    path: ['endTime'],
  })
  .refine((span) => span.parentId !== span.id, {
    message: 'a span cannot be its own parent',
    path: ['parentId'],
  });

export type SpanPayload = z.infer<typeof spanSchema>;

export const spanBatchSchema = z.object({
  spans: z.array(spanSchema).min(1).max(MAX_SPANS_PER_BATCH),
  sdk: z
    .object({
      name: z.string().max(100),
      version: z.string().max(50),
    })
    .optional(),
});

export type SpanBatch = z.infer<typeof spanBatchSchema>;

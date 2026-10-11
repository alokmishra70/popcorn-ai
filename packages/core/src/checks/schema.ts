import { z } from 'zod';

/** Dot path into the run's final output, e.g. `"triage.category"`. Omit to check the whole output. */
const outputPath = z.string().max(200).optional();
const label = z.string().max(120).optional();

export const checkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_called'),
    name: label,
    tool: z.string().min(1),
    minTimes: z.number().int().nonnegative().default(1),
    maxTimes: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('tool_not_called'),
    name: label,
    tool: z.string().min(1),
  }),
  z.object({
    type: z.literal('tool_args_schema'),
    name: label,
    tool: z.string().min(1),
    schema: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('output_contains'),
    name: label,
    path: outputPath,
    value: z.string().min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('output_matches'),
    name: label,
    path: outputPath,
    pattern: z.string().min(1),
    flags: z
      .string()
      .regex(/^[gimsuy]*$/)
      .optional(),
  }),
  z.object({
    type: z.literal('output_equals'),
    name: label,
    path: outputPath,
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('valid_json'),
    name: label,
    path: outputPath,
  }),
  z.object({
    type: z.literal('max_steps'),
    name: label,
    max: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('max_cost'),
    name: label,
    maxUsd: z.number().positive(),
  }),
  z.object({
    type: z.literal('llm_judge'),
    name: label,
    rubric: z.string().min(1).max(4000),
    model: z.string().optional(),
  }),
]);

export type Check = z.infer<typeof checkSchema>;
export type CheckInput = z.input<typeof checkSchema>;
export type CheckType = Check['type'];

export const checkListSchema = z.array(checkSchema).max(50);

/** Result types beyond the configurable checks, added by the eval runner. */
export type CheckResultType = CheckType | 'run_completed' | 'checks_valid';

export interface CheckResult {
  name: string;
  type: CheckResultType;
  passed: boolean;
  /** Not evaluated, e.g. a judge check when the judge is turned off. Counts as passed. */
  skipped?: boolean;
  /** Why the check failed, or the judge's reasoning. */
  reason?: string;
  /** Set for llm_judge checks so a verdict can be traced to the exact judge setup. */
  judge?: { model: string; promptVersion: string };
}

export function checkLabel(check: Check): string {
  if (check.name) return check.name;
  switch (check.type) {
    case 'tool_called':
      return `calls ${check.tool}`;
    case 'tool_not_called':
      return `does not call ${check.tool}`;
    case 'tool_args_schema':
      return `${check.tool} args match schema`;
    case 'output_contains':
      return `${check.path ?? 'output'} contains "${check.value}"`;
    case 'output_matches':
      return `${check.path ?? 'output'} matches /${check.pattern}/`;
    case 'output_equals':
      return `${check.path ?? 'output'} equals ${JSON.stringify(check.value)}`;
    case 'valid_json':
      return `${check.path ?? 'output'} is valid JSON`;
    case 'max_steps':
      return `at most ${check.max} steps`;
    case 'max_cost':
      return `costs at most $${check.maxUsd}`;
    case 'llm_judge':
      return (
        'judge: ' + (check.rubric.length > 60 ? `${check.rubric.slice(0, 57)}...` : check.rubric)
      );
  }
}

import { Ajv, type ValidateFunction } from 'ajv';
import { canonicalJson } from '../canonical';
import type { StoredSpan } from '../schemas/run';
import { findRootSpan, listSteps, sumUsage } from '../trace';
import { checkLabel, type Check, type CheckResult } from './schema';

export interface EvalSubject {
  spans: readonly StoredSpan[];
  /** The agent's final answer. Defaults to the root span's output. */
  output?: unknown;
  /** The test case input, passed through to the judge. */
  input?: unknown;
  /** The test case's expected outcome, passed through to the judge. */
  expected?: unknown;
}

export interface JudgeRequest {
  rubric: string;
  model?: string;
  input: unknown;
  output: unknown;
  expected: unknown;
}

export interface JudgeVerdict {
  passed: boolean;
  reason: string;
  model: string;
  promptVersion: string;
}

export type Judge = (request: JudgeRequest) => Promise<JudgeVerdict>;

const ajv = new Ajv({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();

function compileSchema(schema: Record<string, unknown>): ValidateFunction {
  const key = canonicalJson(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }
  return validate;
}

export function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current: unknown = typeof value === 'string' ? (tryParseJson(value) ?? value) : value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const asText = (value: unknown) =>
  value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);

const pass = (check: Check): CheckResult => ({
  name: checkLabel(check),
  type: check.type,
  passed: true,
});
const fail = (check: Check, reason: string): CheckResult => ({
  name: checkLabel(check),
  type: check.type,
  passed: false,
  reason,
});

/** Evaluates one deterministic check. `llm_judge` checks need {@link runChecks} with a judge. */
export function evaluateCheck(
  check: Exclude<Check, { type: 'llm_judge' }>,
  subject: EvalSubject,
): CheckResult {
  const output =
    subject.output !== undefined ? subject.output : findRootSpan(subject.spans)?.output;
  const toolSpans = subject.spans.filter((s) => s.kind === 'tool');

  switch (check.type) {
    case 'tool_called': {
      const count = toolSpans.filter((s) => s.name === check.tool).length;
      if (count < check.minTimes) {
        return fail(
          check,
          `${check.tool} called ${count} time(s), expected at least ${check.minTimes}`,
        );
      }
      if (check.maxTimes !== undefined && count > check.maxTimes) {
        return fail(
          check,
          `${check.tool} called ${count} time(s), expected at most ${check.maxTimes}`,
        );
      }
      return pass(check);
    }
    case 'tool_not_called': {
      const count = toolSpans.filter((s) => s.name === check.tool).length;
      return count === 0 ? pass(check) : fail(check, `${check.tool} was called ${count} time(s)`);
    }
    case 'tool_args_schema': {
      const calls = toolSpans.filter((s) => s.name === check.tool);
      if (calls.length === 0) return fail(check, `${check.tool} was never called`);
      const validate = compileSchema(check.schema);
      for (const call of calls) {
        if (!validate(call.input)) {
          return fail(check, `invalid args for ${check.tool}: ${ajv.errorsText(validate.errors)}`);
        }
      }
      return pass(check);
    }
    case 'output_contains': {
      const text = asText(readPath(output, check.path));
      const found = check.caseSensitive
        ? text.includes(check.value)
        : text.toLowerCase().includes(check.value.toLowerCase());
      return found
        ? pass(check)
        : fail(check, `"${check.value}" not found in ${check.path ?? 'output'}`);
    }
    case 'output_matches': {
      const text = asText(readPath(output, check.path));
      return new RegExp(check.pattern, check.flags).test(text)
        ? pass(check)
        : fail(check, `${check.path ?? 'output'} does not match /${check.pattern}/`);
    }
    case 'output_equals': {
      const actual = readPath(output, check.path);
      return canonicalJson(actual) === canonicalJson(check.value)
        ? pass(check)
        : fail(
            check,
            `expected ${JSON.stringify(check.value)}, got ${JSON.stringify(actual ?? null)}`,
          );
    }
    case 'valid_json': {
      const value = readPath(output, check.path);
      if (value !== null && typeof value === 'object') return pass(check);
      if (typeof value === 'string' && tryParseJson(value) !== undefined) return pass(check);
      return fail(check, `${check.path ?? 'output'} is not valid JSON`);
    }
    case 'max_steps': {
      const steps = listSteps(subject.spans).length;
      return steps <= check.max
        ? pass(check)
        : fail(check, `${steps} steps, limit is ${check.max}`);
    }
    case 'max_cost': {
      const { costUsd } = sumUsage(subject.spans);
      return costUsd <= check.maxUsd
        ? pass(check)
        : fail(check, `cost $${costUsd.toFixed(4)}, limit is $${check.maxUsd}`);
    }
  }
}

/**
 * Runs every check for one test case. Judge checks are skipped when no judge is
 * passed, and a judge that throws fails that check rather than the whole case.
 */
export async function runChecks(
  checks: readonly Check[],
  subject: EvalSubject,
  judge?: Judge,
): Promise<CheckResult[]> {
  const output =
    subject.output !== undefined ? subject.output : findRootSpan(subject.spans)?.output;
  const results: CheckResult[] = [];

  for (const check of checks) {
    if (check.type !== 'llm_judge') {
      results.push(evaluateCheck(check, { ...subject, output }));
      continue;
    }
    if (!judge) {
      results.push({ ...pass(check), skipped: true, reason: 'judge turned off' });
      continue;
    }
    try {
      const verdict = await judge({
        rubric: check.rubric,
        model: check.model,
        input: subject.input,
        output,
        expected: subject.expected,
      });
      results.push({
        name: checkLabel(check),
        type: check.type,
        passed: verdict.passed,
        reason: verdict.reason,
        judge: { model: verdict.model, promptVersion: verdict.promptVersion },
      });
    } catch (error) {
      results.push(
        fail(check, `judge error: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }
  return results;
}

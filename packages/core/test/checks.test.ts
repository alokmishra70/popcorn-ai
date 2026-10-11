import { describe, expect, it, vi } from 'vitest';
import { checkSchema, runChecks, type Check, type CheckInput } from '../src';
import { run } from './fixtures';

const parse = (input: CheckInput): Check => checkSchema.parse(input);

const spans = run(
  [
    { kind: 'llm', name: 'claude', costUsd: 0.003 },
    { kind: 'tool', name: 'lookup_order', input: { orderId: 'A-1001' } },
    { kind: 'llm', name: 'claude', costUsd: 0.002 },
  ],
  { output: { category: 'refund', reply: 'Your refund for order A-1001 is on its way.' } },
);

async function check(input: CheckInput) {
  const [result] = await runChecks([parse(input)], { spans });
  return result!;
}

describe('deterministic checks', () => {
  it('tool_called respects min and max', async () => {
    expect((await check({ type: 'tool_called', tool: 'lookup_order' })).passed).toBe(true);
    expect((await check({ type: 'tool_called', tool: 'issue_refund' })).passed).toBe(false);
    expect((await check({ type: 'tool_called', tool: 'lookup_order', maxTimes: 0 })).passed).toBe(
      false,
    );
  });

  it('tool_args_schema validates every call', async () => {
    const schema = {
      type: 'object',
      required: ['orderId'],
      properties: { orderId: { type: 'string', pattern: '^A-\\d+$' } },
    };
    expect((await check({ type: 'tool_args_schema', tool: 'lookup_order', schema })).passed).toBe(
      true,
    );
    const strict = { ...schema, properties: { orderId: { type: 'number' } } };
    const result = await check({ type: 'tool_args_schema', tool: 'lookup_order', schema: strict });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/orderId/);
  });

  it('output checks read nested paths', async () => {
    expect((await check({ type: 'output_equals', path: 'category', value: 'refund' })).passed).toBe(
      true,
    );
    expect((await check({ type: 'output_contains', path: 'reply', value: 'REFUND' })).passed).toBe(
      true,
    );
    expect(
      (await check({ type: 'output_matches', path: 'reply', pattern: 'A-\\d{4}' })).passed,
    ).toBe(true);
    expect((await check({ type: 'valid_json' })).passed).toBe(true);
  });

  it('budget checks use steps and cost', async () => {
    expect((await check({ type: 'max_steps', max: 3 })).passed).toBe(true);
    expect((await check({ type: 'max_steps', max: 2 })).passed).toBe(false);
    expect((await check({ type: 'max_cost', maxUsd: 0.004 })).passed).toBe(false);
  });
});

describe('llm_judge', () => {
  it('records the judge verdict and version', async () => {
    const judge = vi
      .fn()
      .mockResolvedValue({ passed: true, reason: 'polite', model: 'm', promptVersion: 'v1' });
    const [result] = await runChecks(
      [parse({ type: 'llm_judge', rubric: 'Reply is polite' })],
      { spans },
      judge,
    );
    expect(judge).toHaveBeenCalledWith(expect.objectContaining({ rubric: 'Reply is polite' }));
    expect(result).toMatchObject({
      passed: true,
      reason: 'polite',
      judge: { model: 'm', promptVersion: 'v1' },
    });
  });

  it('skips judge checks when no judge is configured', async () => {
    const [result] = await runChecks([parse({ type: 'llm_judge', rubric: 'x' })], { spans });
    expect(result).toMatchObject({ passed: true, skipped: true });
  });

  it('fails the check, not the run, when the judge throws', async () => {
    const judge = vi.fn().mockRejectedValue(new Error('rate limited'));
    const [result] = await runChecks([parse({ type: 'llm_judge', rubric: 'x' })], { spans }, judge);
    expect(result).toMatchObject({ passed: false, reason: 'judge error: rate limited' });
  });
});

import { describe, expect, it } from 'vitest';
import { computeCost, findModelPrice } from '../src';

describe('findModelPrice', () => {
  it('matches exact ids', () => {
    expect(findModelPrice('claude-opus-5-5')).toEqual(
      expect.objectContaining({ input: 4, output: 20 }),
    );
  });

  it('prefers the longest prefix for dated ids', () => {
    expect(findModelPrice('gpt-4o-mini-2024-07-18')?.input).toBe(0.15);
    expect(findModelPrice('gpt-4o-2024-08-06')?.input).toBe(2.5);
  });

  it('strips the bedrock prefix', () => {
    expect(findModelPrice('anthropic.claude-haiku-5-5')?.output).toBe(0.5);
  });

  it('returns undefined for unknown models', () => {
    expect(findModelPrice('some-local-model')).toBeUndefined();
  });
});

describe('computeCost', () => {
  it('prices input, output and cache tokens separately', () => {
    const cost = computeCost('claude-sonnet-5-5', {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2 + 1 + 0.2, 6);
  });

  it('returns null when the model or usage is unknown', () => {
    expect(computeCost('mystery', { inputTokens: 1, outputTokens: 1 })).toBeNull();
    expect(computeCost('claude-opus-5-5', undefined)).toBeNull();
  });
});

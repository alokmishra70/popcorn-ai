import table from './models.json';
import type { TokenUsage } from '../schemas/span';

export interface ModelPrice {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type PriceTable = Record<string, ModelPrice>;

const TOKENS_PER_UNIT = 1_000_000;

export const defaultPriceTable: PriceTable = table.models;

// Longest prefix first, so "gpt-4o-mini-2024-07-18" matches gpt-4o-mini rather than gpt-4o.
const prefixOrder = (prices: PriceTable) => Object.keys(prices).sort((a, b) => b.length - a.length);

const prefixCache = new WeakMap<PriceTable, string[]>();

export function findModelPrice(
  model: string,
  prices: PriceTable = defaultPriceTable,
): ModelPrice | undefined {
  const normalized = model
    .trim()
    .toLowerCase()
    .replace(/^anthropic\./, '');
  const exact = prices[normalized];
  if (exact) return exact;

  let keys = prefixCache.get(prices);
  if (!keys) {
    keys = prefixOrder(prices);
    prefixCache.set(prices, keys);
  }
  const key = keys.find((candidate) => normalized.startsWith(candidate));
  return key ? prices[key] : undefined;
}

/**
 * Cost in USD for one LLM call. Returns null when the model is not in the price
 * table, so callers can tell "free" apart from "unknown".
 */
export function computeCost(
  model: string | null | undefined,
  usage: TokenUsage | null | undefined,
  prices: PriceTable = defaultPriceTable,
): number | null {
  if (!model || !usage) return null;
  const price = findModelPrice(model, prices);
  if (!price) return null;

  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const cost =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    cacheRead * (price.cacheRead ?? price.input) +
    cacheWrite * (price.cacheWrite ?? price.input);

  return roundUsd(cost / TOKENS_PER_UNIT);
}

/** Round to a micro-dollar; enough precision for per-call costs without float noise. */
export function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

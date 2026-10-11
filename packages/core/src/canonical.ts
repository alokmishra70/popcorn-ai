/**
 * Deterministic JSON: object keys sorted, undefined dropped, Dates as ISO strings,
 * whitespace at the ends of strings trimmed. Two argument objects that differ only
 * in key order or incidental padding produce the same output, which is what makes
 * fixture lookup during replay stable.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? 'null';
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Object.is(value, -0) || !Number.isFinite(value) ? 0 : value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined || typeof entry === 'function') continue;
    out[key] = normalize(entry);
  }
  return out;
}

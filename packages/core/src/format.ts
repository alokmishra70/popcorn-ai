export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toFixed(4)}`;
  if (abs < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatTokens(count: number | null | undefined): string {
  if (count === null || count === undefined) return '-';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** "+2", "-1", "0": used for pass-count deltas in CLI and CI output. */
export function formatSigned(value: number, format: (n: number) => string = String): string {
  if (value === 0) return format(0);
  return value > 0 ? `+${format(value)}` : `-${format(Math.abs(value))}`;
}

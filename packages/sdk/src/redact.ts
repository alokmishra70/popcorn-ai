import type { SpanPayload } from '@popcornai/core';

/** Returns the span to export, or null to drop it. Runs before the span leaves the process. */
export type SpanRedactor = (span: SpanPayload) => SpanPayload | null;

export const REDACTED = '[REDACTED]';

const SECRET_KEY =
  /^(authorization|proxy-authorization|x-api-key|api[-_]?key|apikey|password|passwd|secret|client[-_]?secret|access[-_]?token|refresh[-_]?token|cookie|set-cookie)$/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// International and North American formats with at least 9 digits; avoids matching
// order numbers or timestamps that happen to contain dashes.
const PHONE =
  /(?<![\w-])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g;

type Transform = (value: string) => string;

function mapDeep(value: unknown, transformString: Transform | null, dropSecrets: boolean): unknown {
  if (typeof value === 'string') return transformString ? transformString(value) : value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => mapDeep(v, transformString, dropSecrets));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] =
      dropSecrets && SECRET_KEY.test(key) && entry !== null && entry !== undefined
        ? REDACTED
        : mapDeep(entry, transformString, dropSecrets);
  }
  return out;
}

function mapSpan(
  span: SpanPayload,
  transformString: Transform | null,
  dropSecrets: boolean,
): SpanPayload {
  const next: SpanPayload = { ...span };
  if (span.input !== undefined) next.input = mapDeep(span.input, transformString, dropSecrets);
  if (span.output !== undefined) next.output = mapDeep(span.output, transformString, dropSecrets);
  if (span.attributes) {
    next.attributes = mapDeep(span.attributes, transformString, dropSecrets) as Record<
      string,
      unknown
    >;
  }
  if (span.error && transformString) {
    next.error = { ...span.error, message: transformString(span.error.message) };
  }
  return next;
}

/** Always applied: replaces values under auth-like keys (authorization, api_key, password, ...). */
export const stripSecrets: SpanRedactor = (span) => mapSpan(span, null, true);

const replacing =
  (pattern: RegExp, replacement: string): SpanRedactor =>
  (span) =>
    mapSpan(span, (text) => text.replace(pattern, replacement), false);

export const redactors = {
  /** Masks email addresses in inputs, outputs, attributes and error messages. */
  email: replacing(EMAIL, '[EMAIL]'),
  /** Masks phone numbers with 9 or more digits. */
  phone: replacing(PHONE, '[PHONE]'),
  /** Masks every match of a custom pattern. The pattern must have the `g` flag. */
  pattern: (pattern: RegExp, replacement = REDACTED) => {
    if (!pattern.flags.includes('g'))
      throw new TypeError('redactors.pattern needs a global (g) RegExp');
    return replacing(pattern, replacement);
  },
  /** Runs redactors in order; stops as soon as one drops the span. */
  compose:
    (...redactors: SpanRedactor[]): SpanRedactor =>
    (span) => {
      let current: SpanPayload | null = span;
      for (const redact of redactors) {
        if (!current) return null;
        current = redact(current);
      }
      return current;
    },
};

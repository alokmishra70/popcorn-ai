import { createHash } from 'node:crypto';
import type { SpanKind, SpanPayload, TokenUsage } from '@popcornai/core';

/*
 * OTLP/HTTP JSON → Popcorn spans (FR-2.7). Follows the OpenTelemetry GenAI
 * semantic conventions for model calls and tool executions; anything else
 * becomes a `step` span with its attributes kept.
 */

interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: AnyValue[] };
  kvlistValue?: { values?: KeyValue[] };
}

interface KeyValue {
  key: string;
  value?: AnyValue;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string | number;
  endTimeUnixNano: string | number;
  attributes?: KeyValue[];
  status?: { code?: number | string; message?: string };
}

export interface OtlpTraceRequest {
  resourceSpans?: Array<{
    resource?: { attributes?: KeyValue[] };
    scopeSpans?: Array<{ spans?: OtlpSpan[] }>;
  }>;
}

const LLM_OPERATIONS = new Set(['chat', 'text_completion', 'generate_content', 'completion']);

function decode(value: AnyValue | undefined): unknown {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  if (value.kvlistValue) return toRecord(value.kvlistValue.values);
  return null;
}

function toRecord(pairs: KeyValue[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs ?? []) out[pair.key] = decode(pair.value);
  return out;
}

/** OTLP ids are random hex; map them onto stable UUIDs (version 8) so parent links survive. */
export function otlpIdToUuid(traceId: string, spanId = ''): string {
  const bytes = createHash('sha256')
    .update(`${traceId.toLowerCase()}:${spanId.toLowerCase()}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const nanosToMs = (value: string | number) => Number(BigInt(value) / 1000n) / 1000;

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function take(attributes: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in attributes) {
      const value = attributes[key];
      delete attributes[key];
      if (value !== null && value !== undefined) return value;
    }
  }
  return undefined;
}

export function convertOtlp(request: OtlpTraceRequest): SpanPayload[] {
  const out: SpanPayload[] = [];
  for (const resourceSpans of request.resourceSpans ?? []) {
    const resource = toRecord(resourceSpans.resource?.attributes);
    const serviceName =
      typeof resource['service.name'] === 'string' ? resource['service.name'] : undefined;

    for (const scope of resourceSpans.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) out.push(convertSpan(span, serviceName));
    }
  }
  return out;
}

function convertSpan(span: OtlpSpan, serviceName: string | undefined): SpanPayload {
  const attributes = toRecord(span.attributes);
  const operation = take(attributes, 'gen_ai.operation.name');
  const isRoot = !span.parentSpanId;
  const kind: SpanKind = isRoot
    ? 'agent'
    : operation === 'execute_tool'
      ? 'tool'
      : typeof operation === 'string' && LLM_OPERATIONS.has(operation)
        ? 'llm'
        : 'step';

  const model = take(attributes, 'gen_ai.response.model', 'gen_ai.request.model');
  const provider = take(attributes, 'gen_ai.provider.name', 'gen_ai.system');
  const inputTokens = take(attributes, 'gen_ai.usage.input_tokens', 'gen_ai.usage.prompt_tokens');
  const outputTokens = take(
    attributes,
    'gen_ai.usage.output_tokens',
    'gen_ai.usage.completion_tokens',
  );
  const usage: TokenUsage | undefined =
    inputTokens !== undefined || outputTokens !== undefined
      ? { inputTokens: Number(inputTokens ?? 0), outputTokens: Number(outputTokens ?? 0) }
      : undefined;

  const input =
    kind === 'tool'
      ? take(attributes, 'gen_ai.tool.call.arguments')
      : take(attributes, 'gen_ai.input.messages', 'gen_ai.prompt');
  const output =
    kind === 'tool'
      ? take(attributes, 'gen_ai.tool.call.result')
      : take(attributes, 'gen_ai.output.messages', 'gen_ai.completion');
  const toolName = kind === 'tool' ? take(attributes, 'gen_ai.tool.name') : undefined;
  if (serviceName) attributes['service.name'] = serviceName;

  const statusCode = span.status?.code;
  const failed = statusCode === 2 || statusCode === 'STATUS_CODE_ERROR';

  const payload: SpanPayload = {
    id: otlpIdToUuid(span.traceId, span.spanId),
    runId: otlpIdToUuid(span.traceId),
    parentId: span.parentSpanId ? otlpIdToUuid(span.traceId, span.parentSpanId) : null,
    kind,
    name: (typeof toolName === 'string' ? toolName : span.name).slice(0, 200),
    startTime: nanosToMs(span.startTimeUnixNano),
    endTime: Math.max(nanosToMs(span.endTimeUnixNano), nanosToMs(span.startTimeUnixNano)),
    status: failed ? 'error' : 'ok',
    attributes,
  };
  if (input !== undefined) payload.input = parseMaybeJson(input);
  if (output !== undefined) payload.output = parseMaybeJson(output);
  if (typeof model === 'string') payload.model = model;
  if (typeof provider === 'string') payload.provider = provider;
  if (usage) payload.usage = usage;
  if (failed) payload.error = { message: span.status?.message || 'error' };
  return payload;
}

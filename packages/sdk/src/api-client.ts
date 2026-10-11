import { PopcornApiError } from './errors';
import { getRuntime } from './runtime';
import { SDK_NAME, SDK_VERSION } from './version';

/** Minimal client for the Popcorn read/write API, used by rewind and datasets. */
export async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const { endpoint, apiKey } = getRuntime().api;
  const response = await fetch(new URL(path, endpoint), {
    method,
    headers: {
      accept: 'application/json',
      'user-agent': `${SDK_NAME}/${SDK_VERSION}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  const data = text ? safeParse(text) : undefined;
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : response.statusText;
    throw new PopcornApiError(
      `${method} ${path} failed (${response.status}): ${message}`,
      response.status,
      data,
    );
  }
  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

import type { SpanPayload } from '@popcorn-ai/core';
import { SDK_NAME, SDK_VERSION } from './version';

export class TransportError extends Error {
  override readonly name = 'TransportError';

  constructor(
    message: string,
    /** False for errors that will fail the same way on retry, such as a 400 or 401. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface SpanTransport {
  send(spans: SpanPayload[]): Promise<void>;
}

export interface HttpTransportOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class HttpTransport implements SpanTransport {
  private readonly url: string;

  constructor(private readonly options: HttpTransportOptions) {
    this.url = new URL('/v1/spans', options.endpoint).toString();
  }

  async send(spans: SpanPayload[]): Promise<void> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({ spans, sdk: { name: SDK_NAME, version: SDK_VERSION } }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
    } catch (error) {
      throw new TransportError(`could not reach ${this.url}: ${describe(error)}`, true);
    }

    if (response.ok) return;
    const detail = await response.text().catch(() => '');
    const retryable = response.status === 429 || response.status >= 500;
    throw new TransportError(
      `ingest returned ${response.status}: ${detail.slice(0, 300)}`,
      retryable,
    );
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return cause ? `${error.message} (${cause})` : error.message;
  }
  return String(error);
}

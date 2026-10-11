/** Small client for the endpoints the CLI calls. Endpoint and key come from the environment. */
export class ApiClient {
  constructor(
    readonly endpoint: string = process.env.POPCORN_ENDPOINT ?? 'http://localhost:4100',
    private readonly apiKey: string | undefined = process.env.POPCORN_API_KEY,
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** Like `get`, but resolves to null on 404. */
  async find<T>(path: string): Promise<T | null> {
    try {
      return await this.get<T>(path);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async stream(path: string, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(new URL(path, this.endpoint), { headers: this.headers(), signal });
    if (!response.ok || !response.body) throw new ApiError(`GET ${path} failed`, response.status);
    return response;
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) throw new Error('POPCORN_API_KEY is not set');
    return { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' };
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.endpoint), {
      method,
      headers: {
        ...this.headers(),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!response.ok) {
      const message = (data as { message?: string } | undefined)?.message ?? response.statusText;
      throw new ApiError(`${method} ${path}: ${message}`, response.status);
    }
    return data as T;
  }
}

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

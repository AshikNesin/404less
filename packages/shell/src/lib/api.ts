/** Standard API response envelope (mirrors the server's `api-response.utils`). */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/** Thrown for non-2xx responses and for envelopes without data. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly url: string;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    url: string;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.url = init.url;
  }
}

/** A 401 response, with when its request was sent (a `performance.now()` timestamp). */
export interface UnauthorizedEvent {
  path: string;
  sentAt: number;
}

type Params = Record<string, unknown>;

const BASE_URL = "/api/v1";

function buildUrl(path: string, params?: Params): string {
  const url = /^https?:/.test(path) ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

/**
 * API client: the single surface for backend calls, on plain `fetch`. Unwraps
 * the `{ success, data }` envelope and throws an `ApiError` on failure so
 * callers get typed values directly. The session cookie travels with every
 * request; what a 401 means is up to whoever subscribes to `onUnauthorized`
 * (the session store in `@groot/shell/store/auth`).
 */
class ApiClient {
  private readonly unauthorizedHandlers = new Set<(event: UnauthorizedEvent) => void>();

  /** Run `handler` on every 401 response. Returns an unsubscribe function. */
  onUnauthorized(handler: (event: UnauthorizedEvent) => void): () => void {
    this.unauthorizedHandlers.add(handler);
    return () => {
      this.unauthorizedHandlers.delete(handler);
    };
  }

  private async send(
    method: string,
    path: string,
    options: { params?: Params; body?: unknown } = {},
  ): Promise<Response> {
    const headers = new Headers({ accept: "application/json" });
    let body: BodyInit | undefined;
    if (options.body instanceof FormData) {
      body = options.body; // the browser sets multipart/form-data with the boundary
    } else if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    const sentAt = performance.now();
    const response = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      body,
      credentials: "include",
    });
    if (response.status === 401) {
      for (const handler of this.unauthorizedHandlers) handler({ path, sentAt });
    }
    return response;
  }

  /** Parse the envelope; throw an `ApiError` for non-2xx responses. */
  private async envelope<T>(response: Response, path: string): Promise<ApiResponse<T>> {
    const text = await response.text();
    let parsed: ApiResponse<T> | undefined;
    if (text) {
      try {
        parsed = JSON.parse(text) as ApiResponse<T>;
      } catch {
        parsed = undefined;
      }
    }
    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: parsed?.error?.code ?? `HTTP_${response.status}`,
        message:
          parsed?.error?.message ??
          (response.statusText || `Request failed with status ${response.status}`),
        details: parsed?.error?.details,
        url: path,
      });
    }
    return parsed ?? { success: true };
  }

  private unwrap<T>(envelope: ApiResponse<T>, path: string): T {
    if (envelope.data === undefined || envelope.data === null) {
      throw new ApiError({
        status: 200,
        code: envelope.error?.code ?? "NO_DATA",
        message: envelope.error?.message ?? "No data returned",
        url: path,
      });
    }
    return envelope.data;
  }

  private async call<T>(
    method: string,
    path: string,
    options?: { params?: Params; body?: unknown },
  ): Promise<T> {
    return this.unwrap<T>(
      await this.envelope<T>(await this.send(method, path, options), path),
      path,
    );
  }

  async get<T>(url: string, params?: Params): Promise<T> {
    return this.call<T>("GET", url, { params });
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    return this.call<T>("POST", url, { body: data });
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    return this.call<T>("PUT", url, { body: data });
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    return this.call<T>("PATCH", url, { body: data });
  }

  /**
   * DELETE. Unlike the other verbs, DELETE may legitimately return no body
   * (204 No Content), so this does not throw on missing data — it returns
   * whatever data is present (typed by the caller) or `undefined`.
   */
  async delete<T = unknown>(url: string, data?: unknown): Promise<T> {
    const envelope = await this.envelope<T>(await this.send("DELETE", url, { body: data }), url);
    return envelope.data as T;
  }

  /** Upload `FormData` — the browser sets the multipart Content-Type + boundary. */
  async postForm<T>(url: string, formData: FormData): Promise<T> {
    return this.call<T>("POST", url, { body: formData });
  }

  /** Download a binary file as a `Blob` (no envelope unwrapping). */
  async getBlob(url: string, params?: Params): Promise<Blob> {
    const response = await this.send("GET", url, { params });
    if (!response.ok) await this.envelope(response, url); // throws with the server's message
    return response.blob();
  }
}

export const apiClient = new ApiClient();

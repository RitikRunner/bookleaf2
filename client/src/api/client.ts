interface FieldIssue {
  field: string;
  message: string;
}

/** An error response from the API: `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Per-field validation messages keyed by field name, e.g. `{ subject: '…' }` for `body.subject`. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as FieldIssue[]).map((issue) => [issue.field.split('.').slice(1).join('.'), issue.message]),
    );
  }
}

/** Thin fetch wrapper for the BookLeaf API. The session travels as an httpOnly cookie on the same origin. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }
  return payload as T;
}

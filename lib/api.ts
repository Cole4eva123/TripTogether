// The frontend's only way to the backend. Endpoints and shapes: docs/api.md.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = void>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Something went wrong (${res.status}). Try again.`);
  return data as T;
}

export const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Can't reach TripTogether. Check your connection and try again.";

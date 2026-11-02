import type { ApiErrorBody } from '@htm/shared';

/**
 * Access token chỉ nằm trong bộ nhớ (không localStorage) để giảm rủi ro XSS.
 * Refresh token nằm trong cookie httpOnly; khi gặp 401, client tự làm mới một lần (single-flight).
 */
let accessToken: string | null = null;
const listeners = new Set<() => void>();

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const onSessionExpired = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<{ accessToken: string; user: unknown } | null> | null = null;

/** Single-flight: nhiều lời gọi đồng thời (StrictMode, nhiều request 401) chỉ dùng refresh token một lần. */
export function refreshSession(): Promise<{ accessToken: string; user: unknown } | null> {
  refreshInFlight ??= (async () => {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    const body = await res.json();
    accessToken = body.accessToken;
    return body;
  })().finally(() => (refreshInFlight = null));
  return refreshInFlight;
}

async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include' });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await doFetch(path, init);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await doFetch(path, init);
    else listeners.forEach((fn) => fn());
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (body as ApiErrorBody).error;
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Có lỗi xảy ra', e?.details as never);
  }
  return body as T;
}

export const post = <T>(path: string, data?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) });
export const patch = <T>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

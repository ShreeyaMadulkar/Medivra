/// <reference types="vite/client" />
import type { Role, User } from '../types';

/** Backend base URL. Override with VITE_API_URL in a root .env.local if the API is not on port 5000. */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000/api';

/** The JWT lives in sessionStorage (cleared when the tab closes). It is sent as a Bearer header. */
const TOKEN_KEY = 'medivra.token';
export const tokenStore = {
  get: (): string | null => {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
  },
  clear: () => {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Request failed.', e?.details, e?.retryAfterSeconds);
  }
  return data as T;
}

export interface RegisterInput { name: string; email: string; phone: string; organization: string; role: Role; password: string }

export const api = {
  login: (b: { email: string; password: string; role: Role }) => request<{ token: string; user: User }>('POST', '/auth/login', b),
  register: (b: RegisterInput) => request<{ user: User; message: string }>('POST', '/auth/register', b),
  me: () => request<{ user: User }>('GET', '/auth/me').then((r) => r.user),
};

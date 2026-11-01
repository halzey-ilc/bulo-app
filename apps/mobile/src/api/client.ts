/**
 * Адрес API. На реальном телефоне localhost — это сам телефон, поэтому
 * задайте EXPO_PUBLIC_API_URL=http://<LAN-IP компьютера>:4000/api (см. README).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function getToken() {
  return token;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function messageFrom(body: any, status: number): string {
  const m = body?.message;
  if (Array.isArray(m)) return m.join('\n');
  if (typeof m === 'string' && m) return m;
  if (status === 0) return 'Нет связи с сервером. Проверьте интернет';
  if (status >= 500) return 'Что-то пошло не так на сервере. Попробуйте позже';
  return 'Не удалось выполнить запрос';
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(messageFrom(null, 0), 0);
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // 401 на чужом запросе при наличии токена — сессия истекла
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(messageFrom(data, res.status), res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  del: <T>(p: string) => request<T>('DELETE', p),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Что-то пошло не так';
}

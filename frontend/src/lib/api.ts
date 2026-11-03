import { env } from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// 무료 서버(Render)가 잠들어 있으면 첫 요청이 오래 걸린다. 이때 "서버를 깨우는 중" 화면을 띄운다.
type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
let pending = 0;
let waking = false;

function setWaking(value: boolean) {
  if (waking === value) return;
  waking = value;
  wakeListeners.forEach((l) => l(value));
}

export function onWakeChange(listener: WakeListener) {
  wakeListeners.add(listener);
  return () => {
    wakeListeners.delete(listener);
  };
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  pending += 1;
  const slowTimer = setTimeout(() => setWaking(true), 2500);
  try {
    const headers: Record<string, string> = await authHeader();
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res: Response | undefined;
    // 서버가 깨어나는 동안 연결이 끊길 수 있어 GET만 몇 번 다시 시도한다
    for (let attempt = 0; attempt < (method === 'GET' ? 4 : 1); attempt += 1) {
      try {
        res = await fetch(env.apiUrl + path, { method, headers, body: payload });
        if (res.status !== 502 && res.status !== 503) break;
      } catch {
        if (attempt === (method === 'GET' ? 3 : 0)) throw new ApiError(0, '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요');
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!res) throw new ApiError(0, '서버에 연결할 수 없어요');

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? '요청을 처리하지 못했어요');
    return data as T;
  } finally {
    clearTimeout(slowTimer);
    pending -= 1;
    if (pending === 0) setWaking(false);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

// 로그인 화면 등에서 미리 서버를 깨워둔다 (응답은 기다리지 않음)
export function wakeServer() {
  fetch(`${env.apiUrl}/health`).catch(() => {});
}

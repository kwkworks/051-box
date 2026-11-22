'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const NAV_CACHE = 'box-nav';
const NAV_KEY = '/__pending-nav';
const MAX_AGE_MS = 2 * 60 * 1000;

// 이 사이트 안의 경로만 (//다른사이트 같은 우회 차단)
function safePath(p: unknown): string | null {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//')) return null;
  try {
    const u = new URL(p, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}

// 푸시 알림을 눌렀을 때 그 알림의 화면으로 옮겨 준다 (서비스 워커 sw.js와 짝)
export function PushNavigator() {
  const router = useRouter();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const go = (raw: unknown) => {
      const path = safePath(raw);
      if (!path) return;
      const here = window.location.pathname + window.location.search + window.location.hash;
      if (path !== here) router.push(path);
    };
    const clearPending = async () => {
      try {
        const cache = await caches.open(NAV_CACHE);
        await cache.delete(NAV_KEY);
      } catch {}
    };
    // 앱이 열려 있을 때: 서비스 워커가 보낸 이동 메시지
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'box-navigate') return;
      go(e.data.path);
      clearPending();
    };
    // 앱이 막 켜졌을 때: 알림을 누르고 2분 안이면 저장된 주소로 이어서 이동
    const checkPending = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const cache = await caches.open(NAV_CACHE);
        const res = await cache.match(NAV_KEY);
        if (!res) return;
        const { path, at } = (await res.json()) as { path?: string; at?: number };
        await cache.delete(NAV_KEY);
        if (typeof at === 'number' && Date.now() - at < MAX_AGE_MS) go(path);
      } catch {}
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', checkPending);
    checkPending();
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', checkPending);
    };
  }, [router]);

  return null;
}

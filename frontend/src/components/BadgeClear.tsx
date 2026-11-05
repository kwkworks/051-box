'use client';

import { useEffect } from 'react';

// 앱 아이콘의 빨간 숫자는 휴대폰 알림창에 쌓인 이 앱의 알림 개수다.
// 앱을 열거나 다시 보면 이미 본 것으로 보고 알림창의 알림과 숫자를 지운다.
export function BadgeClear() {
  useEffect(() => {
    const clear = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
        await nav.clearAppBadge?.();
      } catch {}
      try {
        if (!('serviceWorker' in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration('/');
        const list = (await reg?.getNotifications()) ?? [];
        list.forEach((n) => n.close());
      } catch {}
    };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
  return null;
}

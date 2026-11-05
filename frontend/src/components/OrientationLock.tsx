'use client';

import { useEffect } from 'react';

// 설치한 앱(홈 화면 아이콘)으로 열었을 때 세로로 고정한다.
// manifest의 orientation만으로는 예전에 설치한 앱에 바로 반영되지 않아서 앱이 열릴 때마다 한 번 더 요청한다.
// 브라우저 탭에서는 고정이 허용되지 않으므로 조용히 넘어간다 (아이폰은 지원하지 않음).
export function OrientationLock() {
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;
    if (!standalone) return;
    const lock = () => {
      if (document.visibilityState !== 'visible') return;
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('portrait').catch(() => {});
    };
    lock();
    document.addEventListener('visibilitychange', lock);
    return () => document.removeEventListener('visibilitychange', lock);
  }, []);
  return null;
}

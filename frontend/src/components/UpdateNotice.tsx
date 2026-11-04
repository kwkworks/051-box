'use client';

import { useEffect, useState } from 'react';

const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const CHECK_MS = 5 * 60 * 1000;

// 새 버전이 배포되면 "새 버전이 있어요 · 새로고침" 안내를 띄운다.
// 홈 화면 앱은 껐다 켜기 전까지 예전 화면이 남아 있을 수 있어서 필요하다.
export function UpdateNotice() {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (MY_BUILD === 'dev') return; // 개발 중에는 확인하지 않음
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/version?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!stopped && id && id !== 'dev' && id !== MY_BUILD) setHasUpdate(true);
      } catch {}
    };
    const timer = setInterval(check, CHECK_MS);
    const onVisible = () => check();
    document.addEventListener('visibilitychange', onVisible);
    const first = setTimeout(check, 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!hasUpdate) return null;
  return (
    <div className="fixed inset-x-0 top-2 z-[60] flex justify-center px-3" role="status">
      <div className="card flex items-center gap-3 px-4 py-2.5 shadow-xl">
        <span className="text-sm font-bold">✨ 새 버전이 있어요</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
          새로고침
        </button>
        <button type="button" className="px-1 text-sm text-muted" onClick={() => setHasUpdate(false)} aria-label="나중에">
          ✕
        </button>
      </div>
    </div>
  );
}

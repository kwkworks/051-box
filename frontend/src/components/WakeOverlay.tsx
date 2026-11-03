'use client';

import { useEffect, useState } from 'react';
import { onWakeChange } from '@/lib/api';

// 무료 서버가 잠들어 있을 때 첫 요청이 최대 1분 걸릴 수 있어 안내한다
export function WakeOverlay() {
  const [waking, setWaking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(
    () =>
      onWakeChange((value) => {
        setWaking(value);
        if (value) setSeconds(0);
      }),
    [],
  );
  useEffect(() => {
    if (!waking) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [waking]);

  if (!waking) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div className="card flex max-w-md items-center gap-3 px-4 py-3">
        <div className="h-6 w-6 shrink-0 animate-spin rounded-sm border-4 border-ink border-t-yellow" />
        <div className="text-sm">
          <p className="font-bold">서버를 깨우는 중이에요 ({seconds}초)</p>
          <p className="text-muted">오랫동안 쉬고 있던 서버라 최대 1분 정도 걸릴 수 있어요.</p>
        </div>
      </div>
    </div>
  );
}

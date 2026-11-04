'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void> };

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// 홈 화면에 앱으로 설치하는 방법 안내 (이미 설치해서 앱으로 열었으면 숨김)
export function InstallHint() {
  const [installed] = useState(() => typeof window !== 'undefined' && isStandalone());
  const [ios] = useState(() => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);

  // 안드로이드 크롬은 설치 버튼을 직접 띄울 수 있다
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (installed) return null;
  return (
    <section className="card mt-6 flex flex-col gap-2 p-4">
      <h2 className="font-black">📱 휴대폰에 앱으로 설치하기</h2>
      {prompt ? (
        <button type="button" className="btn btn-primary" onClick={() => prompt.prompt()}>
          홈 화면에 051 BOX 설치
        </button>
      ) : ios ? (
        <p className="text-sm text-muted">사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.</p>
      ) : (
        <p className="text-sm text-muted">
          크롬 오른쪽 위 <b>⋮ 메뉴</b> → <b>앱 설치</b>(또는 홈 화면에 추가)를 누르면 앱처럼 쓸 수 있어요.
        </p>
      )}
    </section>
  );
}

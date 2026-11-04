'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void> };

type Env =
  | 'installed' // 이미 홈 화면 앱으로 열었음
  | 'kakao' // 카카오톡 안의 브라우저
  | 'inapp' // 인스타그램·네이버·라인 등 다른 앱 안의 브라우저
  | 'ios-safari'
  | 'ios-other' // 아이폰 크롬 등
  | 'android'
  | 'desktop';

function detect(): Env {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|Whale\/.*inapp/i.test(ua)) return 'inapp';
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

// 카카오톡에서 이 주소를 기본 브라우저(아이폰: 사파리, 안드로이드: 크롬)로 다시 연다
function openInBrowser() {
  const url = window.location.href;
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--burgundy)] text-sm font-black text-white">
        {n}
      </span>
      <span className="pt-0.5 text-[15px] leading-snug">{children}</span>
    </li>
  );
}

// 사파리 공유 버튼 모양
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-5 w-5 align-[-3px] text-[#0A84FF]" fill="none" stroke="currentColor" strokeWidth="2" aria-label="공유">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" strokeLinecap="round" />
    </svg>
  );
}

// 홈 화면에 앱으로 설치하는 방법을 기기·브라우저에 맞춰 안내한다 (이미 설치해서 열었으면 숨김)
export function InstallHint() {
  const [env] = useState<Env>(detect);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [copied, setCopied] = useState(false);

  // 안드로이드 크롬은 설치 창을 바로 띄울 수 있다
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (env === 'installed') return null;

  const ios = /iphone|ipad|ipod/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  return (
    <section className="card mt-6 flex flex-col gap-3 p-4" aria-label="휴대폰에 앱으로 설치하기">
      <h2 className="font-black">📱 휴대폰에 앱으로 설치하기</h2>

      {env === 'kakao' && (
        <>
          <p className="text-sm text-muted">카카오톡 안에서는 설치할 수 없어요. {ios ? '사파리' : '크롬'}에서 열면 바로 설치할 수 있어요.</p>
          <button type="button" className="btn btn-primary h-12 text-base" onClick={openInBrowser}>
            {ios ? '🧭 사파리로 열기' : '🌐 크롬으로 열기'}
          </button>
          <p className="text-xs text-muted">열린 뒤 이 게시판 화면 아래쪽 안내를 따라 해주세요.</p>
        </>
      )}

      {env === 'inapp' && (
        <>
          <p className="text-sm text-muted">앱 안의 브라우저에서는 설치할 수 없어요.</p>
          <ol className="flex flex-col gap-2">
            <Step n={1}>오른쪽 위(또는 아래) <b>⋯ 메뉴</b>를 누르세요</Step>
            <Step n={2}>
              <b>{ios ? 'Safari로 열기' : '다른 브라우저로 열기'}</b>를 누르세요
            </Step>
          </ol>
          <button type="button" className="btn btn-sm" onClick={copyLink}>
            {copied ? '✅ 주소를 복사했어요' : '🔗 주소 복사 (브라우저에 붙여넣기)'}
          </button>
        </>
      )}

      {env === 'ios-safari' && (
        <ol className="flex flex-col gap-2.5">
          <Step n={1}>
            화면 아래쪽 <ShareIcon /> <b>공유 버튼</b>을 누르세요
            <span className="block text-xs text-muted">주소창만 보이면 주소창의 ⋯ 를 먼저 누르세요</span>
          </Step>
          <Step n={2}>
            메뉴를 아래로 내려 <b>홈 화면에 추가</b> ➕ 를 누르세요
          </Step>
          <Step n={3}>
            오른쪽 위 <b>추가</b>를 누르면 끝! 홈 화면의 <b>051 BOX</b> 아이콘으로 열어요
          </Step>
        </ol>
      )}

      {env === 'ios-other' && (
        <ol className="flex flex-col gap-2.5">
          <Step n={1}>
            주소창 오른쪽 <ShareIcon /> <b>공유 버튼</b>을 누르세요
          </Step>
          <Step n={2}>
            <b>홈 화면에 추가</b>를 누르세요
            <span className="block text-xs text-muted">메뉴에 없으면 사파리에서 열어 주세요</span>
          </Step>
          <Step n={3}>
            <b>추가</b>를 누르면 끝!
          </Step>
        </ol>
      )}

      {(env === 'android' || env === 'desktop') &&
        (prompt ? (
          <button type="button" className="btn btn-primary h-12 text-base" onClick={() => prompt.prompt()}>
            ⬇️ 홈 화면에 051 BOX 설치
          </button>
        ) : (
          <ol className="flex flex-col gap-2.5">
            <Step n={1}>
              크롬 오른쪽 위 <b>⋮ 메뉴</b>를 누르세요
            </Step>
            <Step n={2}>
              <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요
            </Step>
          </ol>
        ))}
    </section>
  );
}

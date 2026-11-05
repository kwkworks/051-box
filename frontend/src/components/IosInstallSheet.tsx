'use client';

import { useSyncExternalStore } from 'react';
import { openInBrowser } from './InstallHint';
import { detectInstallEnv, isIos, isIpad, safariMajor } from '@/lib/installEnv';
import { canInstall, promptInstall, subscribeInstall } from '@/lib/installPrompt';

const KEY = 'box-install-sheet'; // 닫은 시각 (3일 동안 다시 안 띄움)
const HIDE_MS = 3 * 24 * 60 * 60 * 1000;
const EVENT = 'box-install-sheet';

type Mode = 'none' | 'kakao' | 'android' | 'classic' | 'ios26' | 'ipad';

function readMode(): Mode {
  // 인쇄용 포스터와 로그인 처리 화면에서는 띄우지 않는다
  const path = window.location.pathname;
  if (path === '/poster' || path.startsWith('/auth')) return 'none';
  const env = detectInstallEnv();
  try {
    const closed = Number(localStorage.getItem(KEY) ?? 0);
    if (Date.now() - closed < HIDE_MS) return 'none';
  } catch {}
  if (env === 'kakao') return 'kakao';
  // 안드로이드 크롬 등: 브라우저가 설치 가능하다고 알려주면 "앱 설치" 버튼 하나로 설치
  if (env === 'android' && canInstall()) return 'android';
  if (env !== 'ios-safari') return 'none';
  if (isIpad()) return 'ipad';
  return safariMajor() >= 26 ? 'ios26' : 'classic';
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  window.addEventListener('popstate', cb);
  const offInstall = subscribeInstall(cb);
  // 화면 이동(포스터 페이지 등)도 다시 확인
  const timer = setInterval(cb, 1000);
  return () => {
    offInstall();
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
    window.removeEventListener('popstate', cb);
    clearInterval(timer);
  };
}

function close() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// 사파리 공유 버튼 모양
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-5 w-5 align-[-4px] text-[#0A84FF]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="공유">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" strokeLinecap="round" />
    </svg>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <span className={`block animate-bounce text-4xl leading-none text-[#E8B923] drop-shadow ${up ? 'rotate-180' : ''}`} aria-hidden>
      ⬇
    </span>
  );
}

// 아이폰 사파리로 처음 들어오면 공유 버튼 위치를 화살표로 가리키며 "홈 화면에 추가"를 안내한다.
// 카카오톡 안에서 열었으면 먼저 사파리(안드로이드는 크롬)로 옮기게 한다. 앱으로 열었거나 닫으면 3일간 숨김.
export function IosInstallSheet() {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'none' as Mode);
  if (mode === 'none') return null;

  const steps =
    mode === 'classic'
      ? [
          <>화면 맨 아래 가운데 <ShareIcon /> <b>공유</b> 버튼을 누르세요</>,
          <>메뉴를 올려서 <b>홈 화면에 추가</b> ➕</>,
          <>오른쪽 위 <b>추가</b> → 홈 화면의 051 아이콘으로 열기</>,
        ]
      : mode === 'ios26'
        ? [
            <>오른쪽 아래 <b>⋯</b> 버튼을 누르세요</>,
            <><ShareIcon /> <b>공유</b> → <b>홈 화면에 추가</b> ➕</>,
            <><b>추가</b> → 홈 화면의 051 아이콘으로 열기</>,
          ]
        : [
            <>오른쪽 위 <ShareIcon /> <b>공유</b> 버튼을 누르세요</>,
            <><b>홈 화면에 추가</b> ➕</>,
            <><b>추가</b> → 홈 화면의 051 아이콘으로 열기</>,
          ];

  // 화살표가 실제 버튼 위치를 가리키도록
  const arrowPos = mode === 'ipad' ? 'justify-end pr-10' : mode === 'ios26' ? 'justify-end pr-6' : 'justify-center';
  const atTop = mode === 'ipad';

  return (
    <div
      className={`fixed inset-x-0 z-50 flex flex-col px-3 ${atTop ? 'top-2' : 'bottom-1'}`}
      style={atTop ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-label="051 BOX 앱 설치 안내"
    >
      {atTop && (
        <div className={`flex ${arrowPos}`}>
          <Arrow up />
        </div>
      )}
      <div className="card relative mx-auto w-full max-w-md p-4 shadow-xl">
        <button type="button" className="absolute right-2 top-2 rounded px-2 py-1 text-sm text-muted" onClick={close} aria-label="안내 닫기">
          ✕
        </button>
        <p className="pr-8 font-black">📱 051 BOX를 앱으로 설치해요</p>
        {mode === 'android' ? (
          <>
            <p className="mt-1 text-sm text-muted">버튼 하나로 홈 화면에 설치하고, 앱처럼 바로 열 수 있어요.</p>
            <button
              type="button"
              className="btn btn-primary mt-3 h-12 w-full text-base"
              onClick={async () => {
                if (await promptInstall()) close();
              }}
            >
              📲 앱 설치
            </button>
            <p className="mt-2 text-xs text-muted">💡 설치한 앱에서 알림도 받을 수 있어요</p>
          </>
        ) : mode === 'kakao' ? (
          <>
            <p className="mt-1 text-sm text-muted">카카오톡 안에서는 설치할 수 없어요. {isIos() ? '사파리' : '크롬'}로 열면 바로 설치할 수 있어요.</p>
            <button type="button" className="btn btn-primary mt-3 h-12 w-full text-base" onClick={openInBrowser}>
              {isIos() ? '🧭 사파리로 열기' : '🌐 크롬으로 열기'}
            </button>
          </>
        ) : (
          <>
            <ol className="mt-2 flex flex-col gap-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[15px] leading-snug">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--burgundy)] text-xs font-black text-white">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted">💡 설치한 앱에서 로그인해 주세요 (사파리와 앱은 로그인이 따로예요)</p>
          </>
        )}
      </div>
      {!atTop && mode !== 'kakao' && mode !== 'android' && (
        <div className={`flex ${arrowPos}`}>
          <Arrow />
        </div>
      )}
    </div>
  );
}

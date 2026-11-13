'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

// QR을 찍으면 나오는 설치 안내 (로그인 없이 볼 수 있음).
// 안드로이드: 크롬에서 설치 → 경고 창이 뜨면 "더보기 → 무시하고 설치"
// 아이폰: 사파리에서 공유 → 더보기 → 홈 화면에 추가
type Platform = 'android' | 'ios' | 'other';

function detect(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}
const subscribe = () => () => {};

export default function InstallGuidePage() {
  const platform = useSyncExternalStore(subscribe, detect, () => 'other' as Platform);

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-16">
      <header className="border-b-2 border-ink bg-[var(--burgundy)] px-4 pb-4 pt-6 text-white">
        <div className="mx-auto max-w-xl">
          <p className="text-sm font-bold text-yellow">크로스핏051 회원 커뮤니티</p>
          <h1 className="mt-1 text-3xl font-black">051 BOX 설치 안내</h1>
          <p className="mt-1 text-sm text-white/85">앱스토어 없이, 1분이면 홈 화면에 설치돼요</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4">
        <section className="card border-[var(--burgundy)] bg-white p-4" role="note">
          <p className="font-black text-[var(--burgundy)]">📌 크로스핏051 박스 회원만 가입이 승인돼요</p>
          <p className="mt-1 text-sm text-muted">카카오 또는 구글로 가입 신청을 하면, 관리자가 박스 회원인지 확인한 뒤 승인해 드려요.</p>
        </section>

        {platform !== 'ios' && <Android highlight={platform === 'android'} />}
        <Ios highlight={platform === 'ios'} />
        {platform === 'ios' && <Android highlight={false} />}

        <section className="card p-4">
          <h2 className="font-black">설치한 다음에는</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px]">
            <li>홈 화면의 <b>051 BOX</b> 아이콘으로 열어요</li>
            <li>카카오 또는 구글로 <b>가입 신청</b>을 해요</li>
            <li>관리자 승인 후 WOD·1RM·모임·채팅을 모두 쓸 수 있어요</li>
            <li>앱 메뉴 → 게시판 → 🔔 알림 설정에서 <b>알림 켜기</b>를 하면 내일 WOD, 공지, 모임 소식을 받아요</li>
          </ol>
        </section>

        <Link href="/login" className="btn btn-primary h-12 w-full text-base">
          051 BOX 열기 →
        </Link>
        <p className="text-center text-xs text-muted">
          처음 열 때 서버를 깨우느라 30초 정도 걸릴 수 있어요. ·{' '}
          <Link href="/privacy" className="underline">
            개인정보처리방침
          </Link>
        </p>
      </main>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-yellow text-sm font-black">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed">{children}</div>
    </li>
  );
}

// 화면 속 버튼 모양을 그대로 그려서 보여준다
function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md border-2 border-ink/30 bg-white px-1.5 py-0.5 align-middle text-sm font-bold">
      {children}
    </span>
  );
}
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#0A84FF]" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" strokeLinecap="round" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#0A84FF]" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

function Android({ highlight }: { highlight: boolean }) {
  return (
    <section className={`card p-4 ${highlight ? 'ring-4 ring-yellow' : ''}`} aria-label="안드로이드 설치 방법">
      <h2 className="text-lg font-black">🤖 안드로이드 (갤럭시 등)</h2>
      <p className="mt-1 text-sm text-muted">카카오톡 안에서 열렸다면 오른쪽 위 메뉴에서 <b>다른 브라우저로 열기 → Chrome</b>을 먼저 눌러 주세요.</p>
      <ol className="mt-3 flex flex-col gap-3">
        <Step n={1}>
          화면 아래 <Key>📲 앱 설치</Key> 버튼을 누르거나, 크롬 오른쪽 위 <Key>⋮</Key> → <Key>앱 설치</Key>를 눌러요
        </Step>
        <Step n={2}>
          <b className="text-[var(--danger)]">경고 창이 뜨면 바로 &quot;확인&quot;을 누르지 마세요!</b> 확인을 누르면 설치가 취소돼요.
          <div className="mt-2 rounded-lg border-2 border-dashed border-[var(--danger)]/60 bg-white p-3 text-sm">
            <p className="font-bold">⚠️ 이런 창이 떠요 (휴대폰 보안 경고)</p>
            <p className="mt-1">
              <Key>더보기</Key> 를 먼저 누르면 아래에 <Key>무시하고 설치</Key> 가 나와요 → 이걸 누르면 설치돼요
            </p>
            <p className="mt-1 text-xs text-muted">플레이스토어를 거치지 않은 앱이라 뜨는 기본 안내예요. 051 BOX는 박스에서 직접 만든 앱이에요.</p>
          </div>
        </Step>
        <Step n={3}>홈 화면에 생긴 <b>051 BOX</b> 아이콘으로 열면 끝!</Step>
      </ol>
    </section>
  );
}

function Ios({ highlight }: { highlight: boolean }) {
  return (
    <section className={`card p-4 ${highlight ? 'ring-4 ring-yellow' : ''}`} aria-label="아이폰 설치 방법">
      <h2 className="text-lg font-black">🍎 아이폰</h2>
      <p className="mt-1 text-sm text-muted">
        꼭 <b>사파리(Safari)</b>로 열어 주세요. 카카오톡에서 열렸다면 오른쪽 아래 <Key><ShareIcon /></Key> 또는 <Key>⋯</Key> → <b>Safari로 열기</b>
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        <Step n={1}>
          사파리 화면 아래(또는 주소창 옆)의 <Key><ShareIcon /> 공유</Key> 버튼을 눌러요
          <span className="block text-xs text-muted">네모 위로 화살표가 나가는 모양이에요. 안 보이면 <Key><MoreIcon /></Key> 를 먼저 눌러요</span>
        </Step>
        <Step n={2}>
          아래에서 올라온 메뉴에서 <Key><MoreIcon /> 더 보기</Key> 를 눌러요
          <span className="block text-xs text-muted">메뉴를 위로 끌어 올려도 아래쪽에 목록이 더 나와요</span>
        </Step>
        <Step n={3}>
          <Key><AddIcon /> 홈 화면에 추가</Key> 를 누르고, 오른쪽 위 <Key>추가</Key> 를 눌러요
        </Step>
        <Step n={4}>홈 화면에 생긴 <b>051 BOX</b> 아이콘으로 열면 끝! (알림은 이렇게 설치한 앱에서만 받을 수 있어요)</Step>
      </ol>
    </section>
  );
}

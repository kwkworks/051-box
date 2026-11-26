'use client';

import type { BrowserKind, PushStep } from '@/lib/push';

const STEP_TITLE: Record<PushStep, string> = {
  1: '1단계 · 알림 허용',
  2: '2단계 · 알림 준비',
  3: '3단계 · 푸시 등록',
  4: '4단계 · 서버 저장',
};

// 멈춘 단계와 브라우저에 맞는 해결 순서
function stepsFor(step: PushStep, browser: BrowserKind): string[] {
  if (step === 1) {
    // 삼성 인터넷으로 설치한 앱: 사이트 알림 허용은 '앱 정보'가 아니라 삼성 인터넷 설정에 있다
    if (browser === 'installed-samsung')
      return [
        '홈 화면에서 삼성 인터넷 앱 열기',
        '아래 메뉴(≡) → 설정 → 사이트 및 다운로드',
        '알림(또는 사이트 권한 관리 → 알림) → 051-box.vercel.app 허용',
        '목록에 없으면: 삼성 인터넷 주소창에 051-box.vercel.app 열고 게시판 → 알림 받기 누르기',
        '051 BOX 앱으로 돌아와 다시 시도',
      ];
    if (browser === 'installed')
      return ['홈 화면의 051 BOX 아이콘을 길게 누르기', 'ⓘ 앱 정보 → 알림 → 허용', '앱을 완전히 껐다가 다시 열고 버튼 누르기'];
    if (browser === 'samsung')
      return ['아래 메뉴(≡) → 설정', '사이트 및 다운로드 → 알림', '051-box.vercel.app → 허용', '이 화면으로 돌아와 버튼 다시 누르기'];
    if (browser === 'chrome')
      return ['주소창 왼쪽 자물쇠(또는 ⓘ) 누르기', '권한 → 알림 → 허용', '이 화면으로 돌아와 버튼 다시 누르기'];
    return ['브라우저 설정에서 051-box.vercel.app 알림 허용', '버튼 다시 누르기'];
  }
  if (step === 4) return ['서버가 깨어나는 중일 수 있어요. 1분쯤 기다리기', '와이파이나 데이터 연결 확인', '다시 시도 누르기'];
  if (step === 2) return ['앱(또는 브라우저)을 완전히 끄기', '다시 열고 버튼 누르기', '그래도 안 되면 휴대폰을 껐다 켜고 다시 시도'];
  return [
    '와이파이나 데이터가 연결돼 있는지 확인',
    '절전 모드 끄기 (설정 → 배터리)',
    'Play 스토어에서 "Google Play 서비스" 업데이트',
    '버튼 다시 누르기',
  ];
}

// 알림 켜기가 멈췄을 때 보여주는 안내 카드: 멈춘 단계 · 해결 순서 · 다시 시도 · 문제 정보(캡처용)
export function PushHelp({
  step,
  browser,
  diag,
  busy,
  onRetry,
}: {
  step: PushStep;
  browser: BrowserKind;
  diag: [string, string][] | null;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-[var(--danger)] bg-[var(--danger)]/5 p-3" role="alert">
      <p className="font-black">⚠️ {STEP_TITLE[step]}에서 멈췄어요</p>
      <ol className="flex flex-col gap-1.5 text-sm">
        {stepsFor(step, browser).map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-black text-white">{i + 1}</span>
            <span className="leading-5">{s}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-primary btn-sm self-start" disabled={busy} onClick={onRetry}>
        {busy ? '다시 시도하는 중…' : '다시 시도'}
      </button>
      {diag && (
        <div className="rounded border border-ink/20 bg-white p-2">
          <p className="mb-1 text-xs font-black text-muted">문제 정보 (안 되면 이 화면을 캡처해서 보내 주세요)</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {diag.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-words font-bold">{v}</dd>
              </div>
            ))}
            <dt className="text-muted">멈춘 단계</dt>
            <dd className="font-bold">{STEP_TITLE[step]}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

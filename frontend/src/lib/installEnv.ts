// 어떤 기기·브라우저에서 열었는지 (앱 설치 안내를 맞춰 보여주기 위해)
export type InstallEnv =
  | 'installed' // 이미 홈 화면 앱으로 열었음
  | 'kakao' // 카카오톡 안의 브라우저
  | 'inapp' // 인스타그램·네이버·라인 등 다른 앱 안의 브라우저
  | 'ios-safari'
  | 'ios-other' // 아이폰 크롬 등
  | 'android'
  | 'desktop';

export function detectInstallEnv(): InstallEnv {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|Whale\/.*inapp/i.test(ua)) return 'inapp';
  if (isIos()) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isIpad() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /ipad/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// 사파리 버전 (iOS 26부터 아래 막대가 바뀌어 공유 버튼이 ⋯ 메뉴 안으로 들어갔다)
export function safariMajor(): number {
  if (typeof navigator === 'undefined') return 0;
  const m = navigator.userAgent.match(/Version\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

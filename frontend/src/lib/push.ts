// 푸시 알림 구독 (이 기기). 서버 공개 키는 Vercel 환경변수 NEXT_PUBLIC_VAPID_PUBLIC_KEY
import { api } from './api';
import { detectInstallEnv, isIos } from './installEnv';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type PushState =
  | 'unsupported' // 이 브라우저는 알림을 받을 수 없음
  | 'ios-install' // 아이폰: 홈 화면에 설치한 앱에서만 가능
  | 'not-configured' // 서버 키 설정 전
  | 'denied' // 사용자가 알림을 차단함
  | 'off'
  | 'on';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

// 휴대폰이 응답하지 않으면 영원히 기다리지 않게 단계마다 시간 제한을 둔다.
// 멈춘 단계(1 알림 허용 · 2 알림 준비 · 3 푸시 등록)를 화면이 받아서 그 단계의 해결 방법을 보여준다
export type PushStep = 1 | 2 | 3;
export class PushStepError extends Error {
  constructor(public step: PushStep) {
    super(`push step ${step} timed out`);
  }
}
function withTimeout<T>(p: Promise<T>, ms: number, step: PushStep): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PushStepError(step)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// 지금 어떤 브라우저로 열었는지 (해결 방법을 그에 맞춰 보여주기 위해)
export type BrowserKind = 'installed-samsung' | 'installed' | 'samsung' | 'chrome' | 'other';
export function browserKind(): BrowserKind {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (detectInstallEnv() === 'installed') return /SamsungBrowser/i.test(ua) ? 'installed-samsung' : 'installed';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Chrome\//i.test(ua)) return 'chrome';
  return 'other';
}

// 문제 정보 (캡처해서 보내 주면 원인을 찾을 수 있게). 개인정보나 키는 넣지 않는다
export async function pushDiagnostics(): Promise<[string, string][]> {
  const ua = navigator.userAgent;
  const browser = /SamsungBrowser\/([\d.]+)/.exec(ua)?.[1]
    ? `삼성 인터넷 ${/SamsungBrowser\/([\d.]+)/.exec(ua)![1]}`
    : /Chrome\/([\d]+)/.exec(ua)?.[1]
      ? `크롬 ${/Chrome\/([\d]+)/.exec(ua)![1]}`
      : '기타';
  const android = /Android ([\d.]+)/.exec(ua)?.[1];
  const permText: Record<string, string> = { granted: '허용됨', denied: '차단됨', default: '아직 묻지 않음' };
  let worker = '없음';
  let push = '없음';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (reg) worker = reg.active ? '준비됨' : reg.installing ? '설치 중' : reg.waiting ? '대기 중' : '등록만 됨';
    const sub = await reg?.pushManager.getSubscription();
    if (sub) push = `등록됨 (${new URL(sub.endpoint).host})`;
  } catch {
    worker = '확인 실패';
  }
  return [
    ['브라우저', `${browser}${android ? ` · 안드로이드 ${android}` : ''}`],
    ['설치 앱으로 열림', detectInstallEnv() === 'installed' ? '예' : '아니요'],
    ['알림 권한', permText[Notification.permission] ?? Notification.permission],
    ['알림 준비', worker],
    ['푸시 등록', push],
  ];
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && detectInstallEnv() !== 'installed') return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!PUBLIC_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

// 버튼을 눌렀을 때 호출 (알림 권한 요청은 사용자 동작 안에서만 가능)
export async function enablePush(): Promise<PushState> {
  // 알림 담당 프로그램(서비스 워커)은 허용을 묻는 동안 함께 준비해 둔다
  const regReady = registration().then(async (r) => {
    await navigator.serviceWorker.ready;
    return r;
  });
  regReady.catch(() => {}); // 실패는 아래에서 단계별로 처리
  const subscribe = (reg: ServiceWorkerRegistration) =>
    reg.pushManager
      .getSubscription()
      .then((s) => s ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) }));

  // 1) 알림 허용: 이미 허용했으면 묻지 않는다
  let permission = Notification.permission;
  let sub: PushSubscription | null = null;
  if (permission !== 'granted') {
    try {
      permission = await withTimeout(Notification.requestPermission(), 12_000, 1);
    } catch {
      if (Notification.permission === 'granted') {
        permission = 'granted'; // 그사이 설정에서 허용함
      } else {
        // 허용 창이 응답하지 않는 기기(예: 삼성 인터넷 설치 앱): 푸시 등록으로 허용을 한 번 더 요청한다
        try {
          const reg = await withTimeout(regReady, 15_000, 2);
          sub = await withTimeout(subscribe(reg), 20_000, 1);
          permission = 'granted';
        } catch (e) {
          if (e instanceof PushStepError && e.step === 2) throw e;
          if (Notification.permission === 'denied') return 'denied';
          throw new PushStepError(1);
        }
      }
    }
  }
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  // 2) 알림 담당 프로그램(서비스 워커) 준비
  const reg = await withTimeout(regReady, 15_000, 2);
  // 3) 휴대폰 푸시 서비스에 등록 (이미 등록돼 있으면 그대로)
  if (!sub) sub = await withTimeout(subscribe(reg), 20_000, 3);
  // 4) 우리 서버에 저장 (서버가 잠들어 있으면 '깨우는 중' 안내가 따로 뜬다)
  await api.post('/push/subscribe', sub.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

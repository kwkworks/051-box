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

// 휴대폰이 응답하지 않으면 영원히 기다리지 않게 단계마다 시간 제한을 둔다
class PushStepError extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PushStepError(message)), ms);
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

const MSG_PERMISSION =
  '알림 허용 창이 뜨지 않았어요. 크롬이면 주소창 옆 🔔(또는 자물쇠) 아이콘 → 알림 허용, 또는 휴대폰 설정 → 애플리케이션 → 크롬(또는 삼성 인터넷) → 알림에서 허용한 뒤 다시 눌러 주세요. (1단계: 알림 허용)';
const MSG_WORKER = '알림 준비가 끝나지 않았어요. 앱을 완전히 껐다가 다시 열고 눌러 주세요. (2단계: 알림 준비)';
const MSG_SUBSCRIBE =
  '휴대폰의 푸시 서비스에 연결하지 못했어요. 와이파이·데이터 연결과 절전 모드를 확인하고, Play 스토어에서 "Google Play 서비스"를 업데이트한 뒤 다시 눌러 주세요. (3단계: 푸시 등록)';

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
  // 1) 알림 허용: 이미 허용했으면 묻지 않는다. 창이 안 뜨는 기기(조용한 알림 요청)를 위해 20초 제한
  let permission = Notification.permission;
  if (permission !== 'granted') {
    try {
      permission = await withTimeout(Notification.requestPermission(), 20_000, MSG_PERMISSION);
    } catch (e) {
      // 시간 안에 응답은 없었지만 그사이 설정에서 허용했으면 계속 진행
      if (Notification.permission !== 'granted') throw e;
      permission = 'granted';
    }
  }
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  // 2) 알림 담당 프로그램(서비스 워커) 준비
  const reg = await withTimeout(
    registration().then(async (r) => {
      await navigator.serviceWorker.ready;
      return r;
    }),
    15_000,
    MSG_WORKER,
  );
  // 3) 휴대폰 푸시 서비스에 등록 (이미 등록돼 있으면 그대로)
  const sub = await withTimeout(
    reg.pushManager
      .getSubscription()
      .then((s) => s ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) })),
    20_000,
    MSG_SUBSCRIBE,
  );
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

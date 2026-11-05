// 안드로이드 크롬 등에서 "앱 설치" 창을 바로 띄우기 위한 저장소.
// 브라우저가 설치 가능하다고 알려주는 이벤트(beforeinstallprompt)는 한 번만 오므로, 앱 전체에서 하나만 보관한다.
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저 기본 안내 대신 우리 버튼으로 띄운다
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function subscribeInstall(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const canInstall = () => deferred !== null;

// 버튼을 눌렀을 때 호출 (사용자 동작 안에서만 설치 창이 뜬다)
export async function promptInstall(): Promise<boolean> {
  const d = deferred;
  if (!d) return false;
  await d.prompt();
  const choice = await d.userChoice;
  deferred = null;
  notify();
  return choice.outcome === 'accepted';
}

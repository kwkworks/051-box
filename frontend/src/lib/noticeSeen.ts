// 새 공지 알림 상태 (이 기기에만 저장): 어디까지 봤는지, 어떤 공지의 팝업을 이미 띄웠는지
import type { Notice } from './types';

const SEEN_KEY = 'box-notice-seen'; // 마지막으로 본 공지의 작성 시각
const POPPED_KEY = 'box-notice-popped'; // 팝업을 띄운 공지 id
const NEW_DAYS = 14; // 이보다 오래된 공지는 "새 공지"로 치지 않는다

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// 가장 최근에 올라온 공지 (고정 여부와 상관없이 작성 시각 기준)
export function latestNotice(notices: Notice[]): Notice | null {
  return notices.reduce<Notice | null>((a, n) => (!a || n.created_at > a.created_at ? n : a), null);
}

export function isNewNotice(n: Notice | null): boolean {
  if (!n) return false;
  if (Date.now() - Date.parse(n.created_at) > NEW_DAYS * 86400000) return false;
  const seen = read(SEEN_KEY);
  return !seen || n.created_at > seen;
}

export function shouldPopup(n: Notice | null): boolean {
  return isNewNotice(n) && read(POPPED_KEY) !== n!.id;
}

export function markPopped(n: Notice) {
  write(POPPED_KEY, n.id);
}

// 공지사항 화면을 열었거나 "공지 보러 가기"를 누르면 본 것으로
export function markNoticesSeen(n: Notice | null) {
  if (!n) return;
  const seen = read(SEEN_KEY);
  if (!seen || n.created_at > seen) write(SEEN_KEY, n.created_at);
}

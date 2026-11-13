const KST = 'Asia/Seoul';

export function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KST }).format(new Date());
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: KST, month: 'long', day: 'numeric', weekday: 'short' }).format(d);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric' }).format(new Date(iso));
}

// <input type="datetime-local"> 값(한국 시간)을 ISO 문자열로
export function localInputToIso(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

// ISO 문자열을 <input type="datetime-local"> 값(한국 시간, YYYY-MM-DDTHH:mm)으로
export function isoToLocalInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16);
}

// 1RM × % 정확한 값 (소수점 둘째 자리까지, 반올림은 회원이 직접)
export function percentWeight(oneRm: number, percent: number): number {
  return Math.round(oneRm * percent) / 100;
}

// 링크는 https만 표시해서 javascript: 같은 위험한 주소를 막는다
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// 무게는 파운드(lb)로 기록하고 kg 환산값을 함께 보여준다
// WOD 무게 표시용: 소수점 둘째 자리까지 반올림해서 항상 두 자리로 (예: 220.50)
export function fixed2(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}
export function lbToKg2(lb: number): string {
  return fixed2(lb * 0.45359237);
}

export function lbToKg(lb: number): number {
  return Math.round(lb * 0.45359237 * 10) / 10;
}
export function fmtLb(lb: number): string {
  return `${Math.round(lb * 10) / 10} lb`;
}

// 시간 기록: 초 → "4:05" 또는 "1:02:30"
export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}


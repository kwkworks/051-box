'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import type { NotifyPrefs, Profile } from '@/lib/types';

const KINDS: { key: keyof NotifyPrefs; label: string; hint: string }[] = [
  { key: 'wod', label: '📋 내일 WOD 공개', hint: '매일 오후 8시 30분' },
  { key: 'notices', label: '📢 공지사항', hint: '새 공지가 올라오면' },
  { key: 'competition', label: '🏆 대회·이벤트', hint: '새 대회·이벤트가 올라오면' },
  { key: 'gathering', label: '🍻 회원 모임', hint: '새 모임이 올라오면' },
];
const DEFAULT_PREFS: NotifyPrefs = { wod: true, notices: true, competition: true, gathering: true };

const STATE_TEXT: Record<PushState, string> = {
  unsupported: '이 브라우저는 알림을 받을 수 없어요. 크롬이나 사파리(홈 화면 앱)에서 열어 주세요.',
  'ios-install': '아이폰은 홈 화면에 설치한 051 BOX 앱에서만 알림을 받을 수 있어요. 아래 설치 안내를 따라 설치한 뒤, 앱에서 다시 켜 주세요.',
  'not-configured': '알림 서버 준비 중이에요. 조금만 기다려 주세요.',
  denied: '알림이 차단되어 있어요. 휴대폰 설정 → 알림(또는 브라우저 사이트 설정)에서 051 BOX 알림을 허용해 주세요.',
  off: '이 기기에서 알림이 꺼져 있어요.',
  on: '이 기기에서 알림을 받고 있어요.',
};

// 게시판 화면의 알림 설정: 이 기기 알림 켜기/끄기 + 종류별 켜고 끄기(모든 기기 공통)
export function NotificationSettings({ profile }: { profile: Profile }) {
  const { setMe } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>({ ...DEFAULT_PREFS, ...(profile.notify_prefs ?? {}) });

  useEffect(() => {
    let alive = true;
    pushState().then((s) => alive && setState(s), () => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const toggleDevice = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '알림을 설정하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const togglePref = async (key: keyof NotifyPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const { profile: updated } = await api.patch<{ profile: Profile }>('/me', { notify_prefs: next });
      setMe((prev) => (prev ? { ...prev, profile: { ...prev.profile, ...updated } } : prev));
    } catch (e) {
      setPrefs(prefs); // 되돌리기
      setMsg(e instanceof Error ? e.message : '저장하지 못했어요');
    }
  };

  const test = async () => {
    setMsg(null);
    try {
      const { sent } = await api.post<{ sent: number }>('/push/test');
      setMsg(sent ? '테스트 알림을 보냈어요. 잠시 후 도착해요.' : '알림을 받을 기기가 없어요. 먼저 알림을 켜 주세요.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '보내지 못했어요');
    }
  };

  return (
    <section className="card mt-6 flex flex-col gap-3 p-4" aria-label="알림 설정">
      <h2 className="font-black">🔔 알림 설정</h2>
      {state && <p className="text-sm text-muted">{STATE_TEXT[state]}</p>}
      {(state === 'on' || state === 'off') && (
        <button type="button" className={`btn h-11 ${state === 'on' ? '' : 'btn-primary'}`} disabled={busy} onClick={toggleDevice}>
          {busy ? '설정하는 중…' : state === 'on' ? '이 기기 알림 끄기' : '🔔 이 기기에서 알림 받기'}
        </button>
      )}
      <div>
        <p className="mb-1 text-xs font-bold text-muted">받을 알림 (내 모든 기기 공통)</p>
        <ul className="flex flex-col divide-y-2 divide-dashed divide-ink/15">
          {KINDS.map((k) => (
            <li key={k.key} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{k.label}</span>
                <span className="block text-xs text-muted">{k.hint}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[k.key]}
                aria-label={`${k.label} 알림`}
                className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors ${prefs[k.key] ? 'bg-[var(--ok)]' : 'bg-white'}`}
                onClick={() => togglePref(k.key)}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-white transition-all ${prefs[k.key] ? 'left-5' : 'left-0.5'}`} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {state === 'on' && (
        <button type="button" className="btn btn-sm self-start" onClick={test}>
          테스트 알림 보내기
        </button>
      )}
      {msg && (
        <p className="text-sm font-bold" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

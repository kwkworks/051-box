'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';

type Status = { enabled: boolean; connected: boolean; connected_at?: string; connected_by?: string | null; wod_autopost?: boolean };

const RESULT_TEXT: Record<string, string> = {
  connected: '✅ 네이버 카페가 연결됐어요. 이제 공지를 쓸 때 카페에도 올릴 수 있어요.',
  expired: '연결 시간이 지났어요 (10분). 다시 눌러 주세요.',
  browser: '연결을 시작한 브라우저와 끝낸 브라우저가 달라요. 이 화면에서 "연결하기"를 다시 눌러 같은 창에서 마쳐 주세요.',
  fail: '연결하지 못했어요. 네이버 개발자 센터의 Callback URL과 테스터 계정을 확인한 뒤 다시 시도해 주세요.',
};

// 관리자 화면: 네이버 카페 연결 (앱 → 카페 동시 등록). 토큰은 서버에만 있고 여기서는 연결 상태만 본다
export function NaverCafeCard() {
  const { data, error, reload } = useLoad(() => api.get<Status>('/admin/naver'), 'naver-status');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 네이버에서 돌아오면 주소의 ?naver=결과 를 보여주고 주소에서는 지운다
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('naver');
    if (!r) return;
    const why = (params.get('why') ?? '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);
    params.delete('naver');
    params.delete('why');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    const text = `${RESULT_TEXT[r] ?? RESULT_TEXT.fail}${why ? ` (원인: ${why})` : ''}`;
    const t = setTimeout(() => setMsg(text), 0);
    return () => clearTimeout(t);
  }, []);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await api.post<{ url: string }>('/admin/naver/connect');
      // 우리 서버의 연결 시작 주소만 연다 (거기서 이 브라우저 표시를 남기고 네이버 로그인으로 넘어간다)
      if (!url.startsWith(`${env.apiUrl}/naver/start?`)) throw new Error('연결 주소가 올바르지 않아요');
      window.location.assign(url);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '연결을 시작하지 못했어요');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('네이버 카페 연결을 끊을까요? 공지를 카페에 함께 올릴 수 없게 돼요.')) return;
    setBusy(true);
    try {
      await api.del('/admin/naver');
      await reload();
      setMsg('연결을 끊었어요.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '연결을 끊지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mb-4 flex flex-col gap-2 p-4" aria-label="네이버 카페 연결">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-black">🟢 네이버 카페 연결</p>
          <p className="text-xs text-muted">연결하면 공지를 쓸 때 카페 &apos;공지사항&apos;·&apos;대회 정보 공유&apos;에도 함께 올릴 수 있어요.</p>
        </div>
        {data?.enabled && (
          <div className="flex shrink-0 flex-col gap-1.5">
            {/* 연결된 상태에서도 다시 연결할 수 있다 (네이버 권한을 새로 받을 때) */}
            <button type="button" className={`btn btn-sm whitespace-nowrap ${data.connected ? '' : 'btn-primary'}`} disabled={busy} onClick={connect}>
              {busy ? '처리 중…' : data.connected ? '다시 연결' : '연결하기'}
            </button>
            {data.connected && (
              <button type="button" className="btn btn-sm whitespace-nowrap" disabled={busy} onClick={disconnect}>
                연결 끊기
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {data && !data.enabled && (
        <p className="text-sm text-muted">아직 서버에 네이버 연동 설정이 없어요 (Render 환경변수 NAVER_CLIENT_ID · NAVER_CLIENT_SECRET).</p>
      )}
      {data?.enabled && (
        <p className="text-sm">
          {data.connected
            ? `✅ 연결됨${data.connected_by ? ` · ${data.connected_by}` : ''}${data.connected_at ? ` · ${formatDateTime(data.connected_at)}` : ''}`
            : '연결 안 됨 · 카페 운영자 네이버 계정으로 연결해 주세요'}
        </p>
      )}
      {data?.enabled && data.connected && (
        <div className="mt-1 flex items-center gap-3 border-t-2 border-dashed border-ink/20 pt-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">📋 WOD 카페 자동 등록</span>
            <span className="block text-xs text-muted">매일 저녁 8시 30분 내일 WOD가 공개될 때 카페 WOD 게시판에도 올려요</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(data.wod_autopost)}
            aria-label="WOD 카페 자동 등록"
            disabled={busy}
            className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors ${data.wod_autopost ? 'bg-[var(--ok)]' : 'bg-white'}`}
            onClick={async () => {
              setBusy(true);
              try {
                await api.put('/admin/naver/wod-autopost', { enabled: !data.wod_autopost });
                await reload();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : '바꾸지 못했어요');
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-white transition-all ${data.wod_autopost ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      )}
      {msg && (
        <p className="text-sm font-bold" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

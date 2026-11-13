'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';

type Status = { enabled: boolean; connected: boolean; connected_at?: string; connected_by?: string | null };

const RESULT_TEXT: Record<string, string> = {
  connected: '✅ 네이버 카페가 연결됐어요. 이제 공지를 쓸 때 카페에도 올릴 수 있어요.',
  expired: '연결 시간이 지났어요 (10분). 다시 눌러 주세요.',
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
    params.delete('naver');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    const text = RESULT_TEXT[r] ?? RESULT_TEXT.fail;
    const t = setTimeout(() => setMsg(text), 0);
    return () => clearTimeout(t);
  }, []);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await api.post<{ url: string }>('/admin/naver/connect');
      // 네이버 로그인 화면으로 (네이버 공식 주소만)
      if (!url.startsWith('https://nid.naver.com/')) throw new Error('연결 주소가 올바르지 않아요');
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
          <button
            type="button"
            className={`btn btn-sm shrink-0 whitespace-nowrap ${data.connected ? '' : 'btn-primary'}`}
            disabled={busy}
            onClick={data.connected ? disconnect : connect}
          >
            {busy ? '처리 중…' : data.connected ? '연결 끊기' : '연결하기'}
          </button>
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
      {msg && (
        <p className="text-sm font-bold" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

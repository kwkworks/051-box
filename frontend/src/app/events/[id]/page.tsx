'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AvatarView } from '@/components/AvatarView';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { EVENT_KINDS } from '@/lib/constants';
import { formatDateTime, safeHttpsUrl } from '@/lib/format';
import type { EventDetail } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function EventDetailPage() {
  return <Guard need="member">{() => <Detail />}</Guard>;
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(() => api.get<{ event: EventDetail }>(`/events/${id}`), id);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ev = data?.event;

  const toggleJoin = async () => {
    if (!ev) return;
    setBusy(true);
    setActionError(null);
    try {
      if (ev.joined) await api.del(`/events/${ev.id}/join`);
      else await api.post(`/events/${ev.id}/join`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!ev || !confirm('이 일정을 삭제할까요? 참가 신청도 함께 사라져요.')) return;
    try {
      await api.del(`/events/${ev.id}`);
      router.replace(`/events?kind=${ev.kind}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '삭제하지 못했어요');
    }
  };

  const closed = ev?.signup_deadline ? new Date(ev.signup_deadline) < new Date() : false;
  const full = ev ? ev.capacity !== null && ev.participants.length >= ev.capacity : false;
  const link = safeHttpsUrl(ev?.link_url);

  return (
    <BoardShell title={ev ? EVENT_KINDS[ev.kind] : '일정'} subtitle={ev?.title}>
      {loading && !ev && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {ev && (
        <>
          <article className="card p-4">
            <h2 className="text-xl font-black">{ev.title}</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="font-bold text-muted">일시</dt>
              <dd>{formatDateTime(ev.starts_at)}</dd>
              {ev.location && (<><dt className="font-bold text-muted">장소</dt><dd>{ev.location}</dd></>)}
              {ev.signup_deadline && (<><dt className="font-bold text-muted">신청 마감</dt><dd>{formatDateTime(ev.signup_deadline)}{closed && ' (마감됨)'}</dd></>)}
              <dt className="font-bold text-muted">인원</dt>
              <dd>{ev.participants.length}{ev.capacity ? ` / ${ev.capacity}명` : '명'}</dd>
              {ev.creator && (<><dt className="font-bold text-muted">등록</dt><dd>{ev.creator.nickname}</dd></>)}
            </dl>
            {ev.description && <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{ev.description}</p>}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-sm mt-4">
                관련 링크 열기 ↗
              </a>
            )}
          </article>

          {actionError && <p className="mt-3 text-sm font-bold text-[var(--danger)]" role="alert">{actionError}</p>}
          <button
            type="button"
            className={`btn mt-4 h-12 w-full ${ev.joined ? '' : 'btn-primary'}`}
            disabled={busy || (!ev.joined && (closed || full))}
            onClick={toggleJoin}
          >
            {busy ? '처리 중…' : ev.joined ? '참가 취소' : closed ? '신청 마감' : full ? '정원이 가득 찼어요' : '🙋 참가하기'}
          </button>

          <section className="mt-6">
            <h3 className="mb-2 font-black">참가자 {ev.participants.length}명</h3>
            {ev.participants.length === 0 ? (
              <p className="card p-4 text-sm text-muted">첫 번째로 참가해보세요!</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {ev.participants.map((p, i) => (
                  <li key={p.user_id} className="card flex flex-col items-center p-2 text-center">
                    <AvatarView avatar={p.avatar} scale={1.5} />
                    <span className="mt-1 w-full truncate text-xs font-bold">{i + 1}. {p.nickname}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ev.can_manage && (
            <button type="button" className="btn btn-danger mt-6 w-full" onClick={remove}>
              일정 삭제
            </button>
          )}
        </>
      )}
    </BoardShell>
  );
}

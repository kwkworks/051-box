'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BoardShell } from '@/components/BoardShell';
import { EventForm } from '@/components/EventForm';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { EVENT_KINDS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { BoxEvent, EventKind, Me } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function EventsPage() {
  return (
    <Guard need="member">
      {(me) => (
        <Suspense fallback={<Loading />}>
          <Events me={me} />
        </Suspense>
      )}
    </Guard>
  );
}

const TABS: EventKind[] = ['competition', 'event', 'gathering'];

function Events({ me }: { me: Me }) {
  // 탭은 주소의 ?kind= 로 정한다 (박스 공간의 포스터/배너에서 바로 들어올 수 있게)
  const searchParams = useSearchParams();
  const router = useRouter();
  const param = searchParams.get('kind');
  const kind: EventKind = param && (TABS as string[]).includes(param) ? (param as EventKind) : 'competition';
  const [creating, setCreating] = useState(false);
  const [past, setPast] = useState(false); // 지난 일정 보기
  const [now] = useState(() => Date.now());
  const isAdmin = me.profile.role === 'admin';

  const changeKind = (k: EventKind) => {
    setCreating(false);
    setPast(false);
    router.replace(`/events?kind=${k}`, { scroll: false });
  };

  const { data, error, loading, reload } = useLoad(
    () => api.get<{ events: BoxEvent[] }>(`/events?kind=${kind}${past ? '&past=1' : ''}`),
    `${kind}:${past ? 'past' : 'upcoming'}`,
  );
  const canCreate = isAdmin || kind === 'gathering';

  return (
    <BoardShell title="🏆 대회·이벤트 · 🍻 회원 모임" subtitle="버튼 하나로 참가 신청">
      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`btn ${kind === k ? 'btn-primary' : ''}`} onClick={() => changeKind(k)}>
            {EVENT_KINDS[k]}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="일정 시기">
        <button type="button" className={`btn btn-sm ${past ? '' : 'btn-dark'}`} aria-pressed={!past} onClick={() => setPast(false)}>
          예정된 {EVENT_KINDS[kind]}
        </button>
        <button type="button" className={`btn btn-sm ${past ? 'btn-dark' : ''}`} aria-pressed={past} onClick={() => { setPast(true); setCreating(false); }}>
          지난 {EVENT_KINDS[kind]}
        </button>
      </div>

      {canCreate && !creating && !past && (
        <button type="button" className="btn btn-dark mb-4 w-full" onClick={() => setCreating(true)}>
          + {kind === 'gathering' ? '모임 만들기' : `${EVENT_KINDS[kind]} 등록`}
        </button>
      )}
      {creating && <EventForm kind={kind} onDone={() => { setCreating(false); reload(); }} />}

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.events.length === 0 && (
        <p className="card p-6 text-center text-muted">{past ? '지난' : '예정된'} {EVENT_KINDS[kind]}이(가) 없어요</p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.events.map((ev) => <EventCard key={ev.id} ev={ev} now={now} past={past} />)}
      </ul>
    </BoardShell>
  );
}

function EventCard({ ev, now, past }: { ev: BoxEvent; now: number; past: boolean }) {
  const deadline = ev.signup_deadline ? new Date(ev.signup_deadline).getTime() : null;
  const closed = deadline !== null && deadline < now;
  const full = ev.capacity !== null && (ev.participant_count ?? 0) >= ev.capacity;
  const soon = deadline !== null && !closed && deadline - now < 3 * 86400000;
  return (
    <li>
      <Link href={`/events/${ev.id}`} className={`card block p-4 transition-transform hover:-translate-y-0.5 ${past ? 'opacity-80' : ''}`}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {past ? (
            <>
              <span className="chip text-muted">지난 일정</span>
              {ev.joined && <span className="chip border-[var(--ok)] text-[var(--ok)]">✓ 참가했어요</span>}
            </>
          ) : (
            <>
              {ev.joined && <span className="chip border-[var(--ok)] text-[var(--ok)]">✓ 참가 중</span>}
              {closed && <span className="chip text-muted">마감</span>}
              {!closed && full && <span className="chip text-[var(--danger)]">정원 마감</span>}
              {soon && !full && <span className="chip bg-yellow">마감 임박</span>}
            </>
          )}
        </div>
        <h2 className="text-lg font-black">{ev.title}</h2>
        <p className="mt-1 text-sm text-muted">
          📅 {formatDateTime(ev.starts_at)}
          {ev.location && ` · 📍 ${ev.location}`}
        </p>
        <p className="mt-1 text-sm font-bold">
          👥 {ev.participant_count ?? 0}
          {ev.capacity ? ` / ${ev.capacity}명` : '명 참가'}
          {!past && ev.signup_deadline && <span className="ml-2 font-normal text-muted">신청 마감 {formatDateTime(ev.signup_deadline)}</span>}
        </p>
      </Link>
    </li>
  );
}

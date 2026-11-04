'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { EVENT_KINDS } from '@/lib/constants';
import { formatDateTime, localInputToIso } from '@/lib/format';
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
  const [now] = useState(() => Date.now());
  const isAdmin = me.profile.role === 'admin';

  const changeKind = (k: EventKind) => {
    setCreating(false);
    router.replace(`/events?kind=${k}`, { scroll: false });
  };

  const { data, error, loading, reload } = useLoad(() => api.get<{ events: BoxEvent[] }>(`/events?kind=${kind}`), kind);
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

      {canCreate && !creating && (
        <button type="button" className="btn btn-dark mb-4 w-full" onClick={() => setCreating(true)}>
          + {kind === 'gathering' ? '모임 만들기' : `${EVENT_KINDS[kind]} 등록`}
        </button>
      )}
      {creating && <EventForm kind={kind} onDone={() => { setCreating(false); reload(); }} />}

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.events.length === 0 && (
        <p className="card p-6 text-center text-muted">예정된 {EVENT_KINDS[kind]}이(가) 없어요</p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.events.map((ev) => <EventCard key={ev.id} ev={ev} now={now} />)}
      </ul>
    </BoardShell>
  );
}

function EventCard({ ev, now }: { ev: BoxEvent; now: number }) {
  const deadline = ev.signup_deadline ? new Date(ev.signup_deadline).getTime() : null;
  const closed = deadline !== null && deadline < now;
  const full = ev.capacity !== null && (ev.participant_count ?? 0) >= ev.capacity;
  const soon = deadline !== null && !closed && deadline - now < 3 * 86400000;
  return (
    <li>
      <Link href={`/events/${ev.id}`} className="card block p-4 transition-transform hover:-translate-y-0.5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {ev.joined && <span className="chip border-[var(--ok)] text-[var(--ok)]">✓ 참가 중</span>}
          {closed && <span className="chip text-muted">마감</span>}
          {!closed && full && <span className="chip text-[var(--danger)]">정원 마감</span>}
          {soon && !full && <span className="chip bg-yellow">마감 임박</span>}
        </div>
        <h2 className="text-lg font-black">{ev.title}</h2>
        <p className="mt-1 text-sm text-muted">
          📅 {formatDateTime(ev.starts_at)}
          {ev.location && ` · 📍 ${ev.location}`}
        </p>
        <p className="mt-1 text-sm font-bold">
          👥 {ev.participant_count ?? 0}
          {ev.capacity ? ` / ${ev.capacity}명` : '명 참가'}
          {ev.signup_deadline && <span className="ml-2 font-normal text-muted">신청 마감 {formatDateTime(ev.signup_deadline)}</span>}
        </p>
      </Link>
    </li>
  );
}

function EventForm({ kind, onDone }: { kind: EventKind; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [deadline, setDeadline] = useState('');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (link && !link.startsWith('https://')) {
      setError('링크는 https:// 로 시작해야 해요');
      return;
    }
    setSaving(true);
    try {
      await api.post('/events', {
        kind,
        title,
        description,
        starts_at: localInputToIso(startsAt),
        location,
        link_url: link || null,
        signup_deadline: deadline ? localInputToIso(deadline) : null,
        capacity: capacity ? Number(capacity) : null,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-4 flex flex-col gap-3 p-4">
      <div>
        <label className="label" htmlFor="e-title">제목</label>
        <input id="e-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'gathering' ? '금요일 회식 🍖' : '2026 부산 크로스핏 챌린지'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="e-start">일시</label>
          <input id="e-start" type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="e-deadline">신청 마감 (선택)</label>
          <input id="e-deadline" type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="e-loc">장소</label>
          <input id="e-loc" className="input" maxLength={100} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="e-cap">정원 (선택)</label>
          <input id="e-cap" type="number" min={1} max={500} className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="e-link">관련 링크 (선택, https)</label>
        <input id="e-link" className="input" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
      </div>
      <div>
        <label className="label" htmlFor="e-desc">설명</label>
        <textarea id="e-desc" className="input" maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="참가비, 부문, 준비물 등" />
      </div>
      {error && <p className="text-sm font-bold text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-dark flex-1" disabled={saving || !title.trim() || !startsAt} onClick={save}>
          {saving ? '저장 중…' : '등록'}
        </button>
        <button type="button" className="btn" onClick={onDone}>취소</button>
      </div>
    </div>
  );
}

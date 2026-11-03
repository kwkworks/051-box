'use client';

import { useState } from 'react';
import { AvatarView } from '@/components/AvatarView';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { formatDateLabel, formatRelative, kstToday } from '@/lib/format';
import type { Me, Profile, Role } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function AdminPage() {
  return <Guard need="admin">{(me) => <Admin me={me} />}</Guard>;
}

const ROLE_LABEL: Record<Role, string> = { pending: '승인 대기', member: '회원', admin: '관리자' };

function Admin({ me }: { me: Me }) {
  const [tab, setTab] = useState<'members' | 'holidays'>('members');
  return (
    <BoardShell title="관리자" subtitle="가입 승인 · 휴무일">
      <div className="mb-4 grid grid-cols-2 gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'members'} className={`btn ${tab === 'members' ? 'btn-primary' : ''}`} onClick={() => setTab('members')}>
          회원 관리
        </button>
        <button type="button" role="tab" aria-selected={tab === 'holidays'} className={`btn ${tab === 'holidays' ? 'btn-primary' : ''}`} onClick={() => setTab('holidays')}>
          휴무일
        </button>
      </div>
      {tab === 'members' ? <Members myId={me.profile.id} /> : <Holidays />}
      <p className="mt-6 text-xs text-muted">WOD, 공지, 대회는 각 게시판에서 바로 작성할 수 있어요.</p>
    </BoardShell>
  );
}

function Members({ myId }: { myId: string }) {
  const { data, error, loading, reload } = useLoad(() => api.get<{ members: Profile[] }>('/admin/members'), 'members');
  const [busyId, setBusyId] = useState<string | null>(null);

  const setRole = async (m: Profile, role: Role) => {
    if (role === 'admin' && !confirm(`${m.nickname}님을 관리자로 지정할까요? 관리자는 모든 게시판과 회원을 관리할 수 있어요.`)) return;
    if (role === 'pending' && !confirm(`${m.nickname}님의 승인을 취소할까요?`)) return;
    setBusyId(m.id);
    try {
      await api.patch(`/admin/members/${m.id}`, { role });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '변경하지 못했어요');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const members = data?.members ?? [];
  const pending = members.filter((m) => m.role === 'pending');
  const others = members.filter((m) => m.role !== 'pending');

  const row = (m: Profile) => (
    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
      <div className="shrink-0 rounded-md bg-[var(--mat)]">
        <AvatarView avatar={m.avatar} scale={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{m.nickname}{m.id === myId && ' (나)'}</p>
        <p className="text-xs text-muted">{ROLE_LABEL[m.role]} · 가입 {m.created_at ? formatRelative(m.created_at) : ''}</p>
      </div>
      {m.id !== myId && (
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {m.role === 'pending' && (
            <button type="button" className="btn btn-sm btn-primary" disabled={busyId === m.id} onClick={() => setRole(m, 'member')}>
              승인
            </button>
          )}
          {m.role === 'member' && (
            <>
              <button type="button" className="btn btn-sm" disabled={busyId === m.id} onClick={() => setRole(m, 'admin')}>관리자로</button>
              <button type="button" className="btn btn-sm btn-danger" disabled={busyId === m.id} onClick={() => setRole(m, 'pending')}>승인 취소</button>
            </>
          )}
          {m.role === 'admin' && (
            <button type="button" className="btn btn-sm" disabled={busyId === m.id} onClick={() => setRole(m, 'member')}>회원으로</button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <>
      <h2 className="mb-2 font-black">승인 대기 {pending.length}명</h2>
      {pending.length === 0 ? (
        <p className="card mb-6 p-4 text-sm text-muted">승인을 기다리는 회원이 없어요</p>
      ) : (
        <ul className="card mb-6 divide-y-2 divide-dashed divide-ink/15">{pending.map(row)}</ul>
      )}
      <h2 className="mb-2 font-black">회원 {others.length}명</h2>
      <ul className="card divide-y-2 divide-dashed divide-ink/15">{others.map(row)}</ul>
    </>
  );
}

function Holidays() {
  const { data, error, loading, reload } = useLoad(() => api.get<{ holidays: { day: string; name: string }[] }>('/admin/holidays'), 'holidays');
  const [day, setDay] = useState(kstToday());
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const add = async () => {
    setMsg(null);
    try {
      await api.post('/admin/holidays', { day, name });
      setName('');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '추가하지 못했어요');
    }
  };

  const today = kstToday();
  const upcoming = (data?.holidays ?? []).filter((h) => h.day >= today);

  return (
    <>
      <div className="card mb-4 flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">일요일은 자동으로 휴무일이에요. 휴무일에는 출석하지 않아도 스트릭이 끊기지 않아요.</p>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
          <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="휴무일 날짜" />
          <input className="input" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="박스 임시휴무" aria-label="휴무일 이름" />
          <button type="button" className="btn btn-dark" disabled={!name.trim()} onClick={add}>추가</button>
        </div>
        {msg && <p className="text-sm font-bold text-[var(--danger)]">{msg}</p>}
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      <ul className="card divide-y-2 divide-dashed divide-ink/15">
        {upcoming.map((h) => (
          <li key={h.day} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-32 shrink-0 font-bold">{formatDateLabel(h.day)}</span>
            <span className="flex-1">{h.name}</span>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={async () => {
                if (!confirm(`${h.name} 휴무일을 삭제할까요?`)) return;
                await api.del(`/admin/holidays/${h.day}`).catch((e) => alert(e.message));
                reload();
              }}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

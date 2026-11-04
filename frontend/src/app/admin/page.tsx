'use client';

import Link from 'next/link';
import { Fragment, useRef, useState } from 'react';
import { AvatarView } from '@/components/AvatarView';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { formatDateLabel, formatRelative, kstToday } from '@/lib/format';
import { movementLabel } from '@/lib/constants';
import { RecordValue } from '@/components/RecordValue';
import type { Me, Profile, Role } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function AdminPage() {
  return <Guard need="admin">{(me) => <Admin me={me} />}</Guard>;
}

const ROLE_LABEL: Record<Role, string> = { pending: '승인 대기', member: '회원', admin: '관리자', rejected: '거절됨' };

function Admin({ me }: { me: Me }) {
  const [tab, setTab] = useState<'members' | 'holidays' | 'sheet'>('members');
  const tabs = [
    ['members', '회원 관리'],
    ['holidays', '휴무일'],
    ['sheet', '구글 시트 WOD'],
  ] as const;
  return (
    <BoardShell title="🔑 관리자" subtitle="가입 승인 · 회원 기록 · 휴무일 · 구글 시트 WOD">
      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn ${tab === key ? 'btn-primary' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'members' && (
        <>
          <Link href="/poster" className="card mb-4 flex items-center gap-3 p-4">
            <span className="text-3xl" aria-hidden>🖨</span>
            <span>
              <span className="block font-black">앱 설치 QR 포스터 인쇄</span>
              <span className="block text-sm text-muted">박스에 붙여두면 아이폰 카메라로 찍어 사파리에서 바로 설치해요</span>
            </span>
          </Link>
          <AdminPowers />
          <Members myId={me.profile.id} />
        </>
      )}
      {tab === 'holidays' && <Holidays />}
      {tab === 'sheet' && <SheetImport />}
      <p className="mt-6 text-xs text-muted">WOD, 공지, 대회는 각 게시판에서 바로 작성할 수 있어요.</p>
    </BoardShell>
  );
}

function Members({ myId }: { myId: string }) {
  const { data, error, loading, reload } = useLoad(() => api.get<{ members: Profile[] }>('/admin/members'), 'members');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recordsOf, setRecordsOf] = useState<string | null>(null);

  // 방금 거절한 신청 (실수했을 때 10초 안에 되돌리기)
  const [undo, setUndo] = useState<Profile | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRole = async (m: Profile, role: Role, opts: { silent?: boolean } = {}) => {
    const restoring = m.role === 'rejected' && role === 'pending'; // 거절 되돌리기는 확인 없이
    if (!opts.silent && !restoring) {
      if (role === 'rejected' && !confirm(`${m.nickname}님의 가입 신청을 거절할까요?\n승인 대기 목록에서 빠지고, 본인이 원하면 다시 신청할 수 있어요.`)) return;
      if (role === 'admin' && !confirm(`${m.nickname}님을 관리자로 지정할까요? 관리자는 모든 게시판과 회원을 관리할 수 있어요.`)) return;
      if (role === 'pending' && !confirm(`${m.nickname}님의 승인을 취소할까요?
이 회원의 기록(1RM, PR 글, 채팅, 모임, 참가 명단)은 다른 회원에게 보이지 않게 돼요. 다시 승인하면 돌아와요.`)) return;
    }
    setBusyId(m.id);
    try {
      await api.patch(`/admin/members/${m.id}`, { role });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (role === 'rejected') {
        setUndo({ ...m, role: 'rejected' });
        undoTimer.current = setTimeout(() => setUndo(null), 10_000);
      } else {
        setUndo(null);
      }
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '변경하지 못했어요');
    } finally {
      setBusyId(null);
    }
  };

  // 회원별 채팅 제한: 1시간 / 오늘 하루 / 해제
  const setMute = async (m: Profile, mute: '1h' | 'today' | 'off') => {
    setBusyId(m.id);
    try {
      await api.patch(`/admin/members/${m.id}/chat`, { mute });
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
  const rejected = members.filter((m) => m.role === 'rejected');
  const others = members.filter((m) => m.role === 'member' || m.role === 'admin');
  const now = data ? Date.parse(new Date().toISOString()) : 0;
  const mutedLabel = (m: Profile) =>
    m.chat_muted_until && Date.parse(m.chat_muted_until) > now
      ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(m.chat_muted_until))
      : null;

  const row = (m: Profile) => (
    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="shrink-0 rounded-md bg-[var(--mat)]">
        <AvatarView avatar={m.avatar} scale={1} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{m.nickname}{m.id === myId && ' (나)'}</p>
        <p className="text-xs text-muted">{ROLE_LABEL[m.role]} · 가입 {m.created_at ? formatRelative(m.created_at) : ''}</p>
        {mutedLabel(m) && <p className="text-xs font-bold text-[var(--danger)]">🚫 {mutedLabel(m)}까지 채팅 제한</p>}
      </div>
      {m.id !== myId && m.role !== 'pending' && (
        <div className="flex w-full shrink-0 flex-wrap justify-end gap-1 sm:w-auto" aria-label={`${m.nickname} 채팅 제한`}>
          {mutedLabel(m) ? (
            <button type="button" className="btn btn-sm" disabled={busyId === m.id} onClick={() => setMute(m, 'off')}>채팅 제한 해제</button>
          ) : (
            <>
              <button type="button" className="btn btn-sm" disabled={busyId === m.id} onClick={() => setMute(m, '1h')}>채팅 1시간 제한</button>
              <button type="button" className="btn btn-sm" disabled={busyId === m.id} onClick={() => setMute(m, 'today')}>오늘 제한</button>
            </>
          )}
        </div>
      )}
      {m.id !== myId && (
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {(m.role === 'pending' || m.role === 'rejected') && (
            <button type="button" className="btn btn-sm btn-primary" disabled={busyId === m.id} onClick={() => setRole(m, 'member')}>
              승인
            </button>
          )}
          {m.role === 'pending' && (
            <button type="button" className="btn btn-sm btn-danger" disabled={busyId === m.id} onClick={() => setRole(m, 'rejected')}>
              거절
            </button>
          )}
          {m.role === 'rejected' && (
            <button type="button" className="btn btn-sm" disabled={busyId === m.id} onClick={() => setRole(m, 'pending')}>
              ↩ 승인 대기로 되돌리기
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
          {/* 승인 대기(승인 취소) 회원도 남은 기록을 확인·삭제할 수 있게 */}
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={recordsOf === m.id}
            onClick={() => setRecordsOf((v) => (v === m.id ? null : m.id))}
          >
            📋 기록 관리
          </button>
        </div>
      )}
      {recordsOf === m.id && <MemberRecords member={m} />}
    </li>
  );

  return (
    <>
      {undo && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4" role="status">
          <div className="card flex items-center gap-3 px-4 py-3 shadow-xl">
            <span className="text-sm font-bold">{undo.nickname}님의 신청을 거절했어요</span>
            <button type="button" className="btn btn-sm btn-primary" disabled={busyId === undo.id} onClick={() => setRole(undo, 'pending')}>
              ↩ 되돌리기
            </button>
          </div>
        </div>
      )}
      <ChatLock />
      <h2 className="mb-2 font-black">승인 대기 {pending.length}명</h2>
      {pending.length === 0 ? (
        <p className="card mb-6 p-4 text-sm text-muted">승인을 기다리는 회원이 없어요</p>
      ) : (
        <ul className="card mb-6 divide-y-2 divide-dashed divide-ink/15">{pending.map(row)}</ul>
      )}
      <h2 className="mb-2 font-black">회원 {others.length}명</h2>
      <ul className="card divide-y-2 divide-dashed divide-ink/15">{others.map(row)}</ul>
      {rejected.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer font-black text-muted">거절한 신청 {rejected.length}명 (다시 신청하면 승인 대기로 돌아와요)</summary>
          <ul className="card mt-2 divide-y-2 divide-dashed divide-ink/15">{rejected.map(row)}</ul>
        </details>
      )}
    </>
  );
}

// 관리자가 할 수 있는 일을 한눈에
function AdminPowers() {
  const items = [
    ['✅', '가입 승인 / 승인 취소', '아래 회원 목록의 "승인", "승인 취소" 버튼. 승인을 취소하면 게시판을 볼 수 없고, 그 회원의 기록도 다른 회원에게 숨겨져요(다시 승인하면 돌아옴).'],
    ['🔑', '관리자 지정 / 해제', '"관리자로", "회원으로" 버튼 (내 권한은 바꿀 수 없어요)'],
    ['📋', '회원 기록 삭제', '"기록 관리"에서 1RM 기록(PR 글 포함)과 모임 글을 하나씩 지우거나, "기록 전체 삭제"로 한 번에 지울 수 있어요(되돌릴 수 없음).'],
    ['🚫', '채팅 제한 / 전체 잠금', '회원별 1시간·오늘 제한, 아래 "채팅 전체 잠금". 박스 채팅창에서 메시지를 직접 지울 수도 있어요.'],
    ['📝', 'WOD · 공지 · 대회', '각 게시판에서 바로 작성·수정·삭제해요.'],
  ];
  return (
    <details className="card mb-4 p-4">
      <summary className="cursor-pointer font-black">🔑 관리자가 할 수 있는 일</summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {items.map(([icon, title, desc]) => (
          <li key={title} className="flex gap-2">
            <span aria-hidden>{icon}</span>
            <span>
              <b>{title}</b>
              <span className="block text-muted">{desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

type MemberRecordsData = {
  oneRm: { id: string; movement: string; is_custom: boolean; unit: 'lb' | 'time'; weight_lb: number | null; time_sec: number | null; achieved_on: string }[];
  gatherings: { id: string; title: string; starts_at: string }[];
};

// 회원이 올린 기록을 보고 지운다 (1RM을 지우면 명예의 벽 PR 글도 함께 지워진다)
function MemberRecords({ member }: { member: Profile }) {
  const { data, error, loading, reload } = useLoad(
    () => api.get<MemberRecordsData>(`/admin/members/${member.id}/records`),
    `records-${member.id}`,
  );
  const [busy, setBusy] = useState<string | null>(null);

  // 기록 전체 삭제 (되돌릴 수 없음): 닉네임을 직접 입력해야 진행
  const purge = async () => {
    const typed = prompt(
      `${member.nickname}님의 기록을 모두 지워요.
(1RM·네임드 WOD 기록, 명예의 벽 글, 채팅, 만든 모임, 참가 신청, 출석)
되돌릴 수 없어요. 진행하려면 닉네임을 입력하세요.`,
    );
    if (typed === null) return;
    if (typed.trim() !== member.nickname) {
      alert('닉네임이 달라서 삭제하지 않았어요');
      return;
    }
    setBusy('purge');
    try {
      const { removed } = await api.del<{ removed: Record<string, number> }>(`/admin/members/${member.id}/records`);
      const total = Object.values(removed ?? {}).reduce((a, b) => a + b, 0);
      alert(`기록 ${total}개를 삭제했어요`);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제하지 못했어요');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (what: string, path: string, id: string) => {
    if (!confirm(`${member.nickname}님의 ${what}을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(id);
    try {
      await api.del(path);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제하지 못했어요');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full rounded-md border-2 border-dashed border-ink/20 bg-[var(--bg)] p-3 text-sm">
      {member.role === 'pending' && (
        <p className="mb-2 rounded bg-yellow/30 px-2 py-1 text-xs font-bold">
          승인 대기(승인 취소) 회원이라 이 기록은 다른 회원에게 보이지 않아요. 다시 승인하면 그대로 보여요.
        </p>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <p className="mb-1 font-black">🏋️ 1RM 기록 {data.oneRm.length}개</p>
          {data.oneRm.length === 0 ? (
            <p className="mb-3 text-muted">기록이 없어요</p>
          ) : (
            <ul className="mb-3 flex flex-col gap-1">
              {data.oneRm.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {movementLabel(r.movement, r.is_custom)} <RecordValue unit={r.unit} weightLb={r.weight_lb} timeSec={r.time_sec} />{' '}
                    <span className="text-xs text-muted">{formatDateLabel(r.achieved_on)}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={busy === r.id}
                    onClick={() => remove('1RM 기록', `/admin/one-rm/${r.id}`, r.id)}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-1 font-black">🍻 만든 모임 {data.gatherings.length}개</p>
          {data.gatherings.length === 0 ? (
            <p className="text-muted">모임 글이 없어요</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.gatherings.map((g) => (
                <Fragment key={g.id}>
                  <li className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busy === g.id}
                      onClick={() => remove('모임 글', `/events/${g.id}`, g.id)}
                    >
                      삭제
                    </button>
                  </li>
                </Fragment>
              ))}
            </ul>
          )}
          {member.role !== 'admin' && (
            <button type="button" className="btn btn-sm btn-danger mt-3 w-full" disabled={busy === 'purge'} onClick={purge}>
              🗑 이 회원의 기록 전체 삭제
            </button>
          )}
        </>
      )}
    </div>
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

type ImportResult = { range: { from: string; to: string }; created: string[]; updated: string[]; skipped: { row: number; reason: string }[] };

// 구글 시트("웹에 게시")에서 WOD를 가져온다
function SheetImport() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ url: string | null; updated_at: string | null }>('/admin/sheet'), 'sheet');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const url = draft ?? data?.url ?? '';

  const saveUrl = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.put('/admin/sheet', { url: url.trim() });
      setDraft(null);
      await reload();
      setMsg('시트 주소를 저장했어요');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      setResult(await api.post<ImportResult>('/admin/sheet/import'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '가져오지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <h2 className="font-black">1. 시트 주소 연결</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            <a className="font-bold text-[var(--burgundy)] underline" href="https://docs.google.com/spreadsheets/d/1_NHzGecU5vC2ubGKmfowyLjpMRPccAhzf-YO5BsH7L4/edit" target="_blank" rel="noopener noreferrer">
              051 BOX WOD 입력 양식
            </a>
            에 날짜별로 WOD를 적어요 (날짜 칸 더블클릭 → 달력, 요일 자동).
          </li>
          <li><b>파일 → 공유 → 웹에 게시</b> → <b>WOD 입력</b> 시트 → 형식 <b>쉼표로 구분된 값(.csv)</b> → 게시</li>
          <li>나온 주소를 아래에 붙여넣고 저장해요.</li>
        </ol>
        <input className="input" value={url} onChange={(e) => setDraft(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" aria-label="구글 시트 웹 게시 주소" />
        <button type="button" className="btn" disabled={busy || !url.trim()} onClick={saveUrl}>
          주소 저장
        </button>
        <p className="text-xs text-muted">
          웹에 게시한 시트는 주소를 아는 사람은 볼 수 있어요. WOD 외의 개인정보는 그 시트에 적지 마세요.
        </p>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <h2 className="font-black">2. WOD 가져오기</h2>
        <p className="text-sm text-muted">
          지난 7일 ~ 앞으로 60일 사이 날짜만 가져와요. 같은 날짜의 WOD는 시트 내용으로 바뀌고, 기록 사진은 그대로 남아요.
        </p>
        <p className="text-xs text-muted">
          읽는 열: 날짜 · 제목 · 스트렝스 · 본 와드 · 비고 · 강도 (예: 백스쿼트 70,75,80 / 데드리프트 60). 제목이 비어 있으면 날짜로 만들고, 아무것도 안 적힌 날짜 줄은 건너뛰어요.
        </p>
        <button type="button" className="btn btn-dark h-12" disabled={busy || !data?.url} onClick={runImport}>
          {busy ? '가져오는 중…' : '시트에서 WOD 가져오기'}
        </button>
      </div>

      {msg && <p className="text-sm font-bold" role="status">{msg}</p>}
      {result && (
        <div className="card p-4 text-sm" role="status">
          <p className="font-black">
            새로 추가 {result.created.length}개 · 수정 {result.updated.length}개 · 건너뜀 {result.skipped.length}개
          </p>
          {result.created.length + result.updated.length > 0 && (
            <p className="mt-1 text-muted">{[...result.created, ...result.updated].sort().join(', ')}</p>
          )}
          {result.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--danger)]">
              {result.skipped.slice(0, 20).map((s, i) => (
                <li key={i}>{s.row}번째 줄: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// 전체 채팅 잠금 (공지 시간 등). 잠겨 있어도 관리자는 쓸 수 있다.
function ChatLock() {
  const { data, reload } = useLoad(() => api.get<{ locked: boolean }>('/admin/chat-lock'), 'chat-lock');
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.put('/admin/chat-lock', { locked: !data.locked });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '변경하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`card mb-6 flex items-center justify-between gap-3 p-4 ${data?.locked ? 'border-[var(--danger)]' : ''}`}>
      <div>
        <p className="font-black">💬 박스 채팅 {data?.locked ? '🔒 잠김' : '열림'}</p>
        <p className="text-xs text-muted">잠그면 회원은 채팅을 보낼 수 없어요. 관리자는 잠금 중에도 쓸 수 있어요.</p>
      </div>
      <button type="button" className={`btn btn-sm ${data?.locked ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !data} onClick={toggle}>
        {data?.locked ? '잠금 해제' : '채팅 잠그기'}
      </button>
    </div>
  );
}

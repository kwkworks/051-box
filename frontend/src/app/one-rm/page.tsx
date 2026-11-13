'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { MOVEMENTS, MOVEMENT_KEYS_SORTED, NAMED_WODS, NAMED_WOD_KEYS_SORTED, matchesSearch, movementLabel } from '@/lib/constants';
import { RecordValue } from '@/components/RecordValue';
import { Podium } from '@/components/Podium';
import { formatDateLabel, kstToday } from '@/lib/format';
import Link from 'next/link';
import type { Gender, Me, OneRmRecord, RankGroups, RecordUnit } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function OneRmPage() {
  return <Guard need="member">{(me) => <OneRm me={me} />}</Guard>;
}

const CUSTOM = '__custom__';

function OneRm({ me }: { me: Me }) {
  const { refreshMe } = useAuth();
  const { data, error, loading, reload } = useLoad(
    () => api.get<{ records: OneRmRecord[]; rankings: Record<string, RankGroups> }>('/one-rm'),
    'one-rm',
  );
  const [unit, setUnit] = useState<RecordUnit>('lb');
  const [movement, setMovement] = useState<string>('back_squat');
  const [customName, setCustomName] = useState('');
  const [weight, setWeight] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [date, setDate] = useState(kstToday());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const isCustom = movement === CUSTOM;
  const weightNum = Number(weight);
  const timeSec = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  const valueOk =
    unit === 'lb'
      ? weightNum > 0 && weightNum <= 1200 && (weightNum * 2) % 1 === 0
      : Number.isInteger(timeSec) && timeSec >= 1 && timeSec <= 86400 && (Number(seconds) || 0) < 60;
  const valid = valueOk && (!isCustom || customName.trim().length > 0);

  // 무게 ↔ 시간을 바꾸면 그 단위의 첫 종목으로
  const switchUnit = (next: RecordUnit) => {
    setUnit(next);
    setMovement(next === 'lb' ? 'back_squat' : 'fran');
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.post<{ isPr: boolean }>('/one-rm', {
        movement: isCustom ? customName.trim() : movement,
        is_custom: isCustom,
        unit,
        ...(unit === 'lb' ? { weight_lb: weightNum } : { time_sec: timeSec }),
        achieved_on: date,
      });
      setMessage({ ok: true, text: res.isPr ? '🎉 PR 달성! 명예의 벽에 올라갔어요' : '기록했어요' });
      setWeight('');
      setMinutes('');
      setSeconds('');
      await Promise.all([reload(), refreshMe()]);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '저장하지 못했어요' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    try {
      await api.del(`/one-rm/${id}`);
      await Promise.all([reload(), refreshMe()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제하지 못했어요');
    }
  };


  return (
    <BoardShell title="🏋️ 1RM 기록" subtitle="내 최고 기록(lb)과 네임드 WOD 기록, 박스 순위">
      <section className="card mb-5 flex flex-col gap-3 p-4">
        <h2 className="font-black">새 기록 남기기</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="기록 종류">
          {(
            [
              ['lb', '🏋️ 무게'],
              ['time', '⏱ 네임드 WOD'],
            ] as const
          ).map(([u, label]) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              className={`btn whitespace-nowrap px-2 ${unit === u ? 'btn-primary' : ''}`}
              onClick={() => switchUnit(u)}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 좁은 화면에서 버튼이 두 줄이 되지 않게 단위 안내는 버튼 밖에 둔다 */}
        <p className="-mt-1 text-xs text-muted">{unit === 'lb' ? '무게는 파운드(lb)로 기록해요' : '네임드 WOD는 끝낸 시간으로 기록해요 (빠를수록 좋음)'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rm-move">{unit === 'lb' ? '종목' : 'WOD'}</label>
            <select id="rm-move" className="input" value={movement} onChange={(e) => setMovement(e.target.value)}>
              {unit === 'lb'
                ? MOVEMENT_KEYS_SORTED.map((m) => (
                    <option key={m} value={m}>{MOVEMENTS[m]}</option>
                  ))
                : NAMED_WOD_KEYS_SORTED.map((m) => (
                    <option key={m} value={m}>{NAMED_WODS[m]}</option>
                  ))}
              <option value={CUSTOM}>직접 입력…</option>
            </select>
          </div>
          {isCustom && (
            <div>
              <label className="label" htmlFor="rm-custom">종목 이름</label>
              <input id="rm-custom" className="input" maxLength={30} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={unit === 'lb' ? '예: 행 클린' : '예: 051 Hero WOD'} />
            </div>
          )}
          {unit === 'lb' ? (
            <div>
              <label className="label" htmlFor="rm-weight">무게 (lb, 0.5 단위)</label>
              <input id="rm-weight" type="number" inputMode="decimal" step={0.5} min={0.5} max={1200} className="input" value={weight} onChange={(e) => setWeight(e.target.value)} />
              {weightNum > 0 && <p className="mt-1 text-xs text-muted">= {Math.round(weightNum * 0.45359237 * 10) / 10} kg</p>}
            </div>
          ) : (
            <div>
              <span className="label">완료 시간</span>
              <div className="flex items-center gap-2">
                <input aria-label="분" type="number" inputMode="numeric" min={0} max={1440} className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="분" />
                <span className="font-black">:</span>
                <input aria-label="초" type="number" inputMode="numeric" min={0} max={59} className="input" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="초" />
              </div>
              <p className="mt-1 text-xs text-muted">예: Fran 4분 5초 → 4 : 5 · Murph 45분 → 45 : 0</p>
            </div>
          )}
          <div>
            <label className="label" htmlFor="rm-date">날짜</label>
            <input id="rm-date" type="date" max={kstToday()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {message && <p className={`text-sm font-bold ${message.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`} role="status">{message.text}</p>}
        <button type="button" className="btn btn-primary h-12" disabled={saving || !valid} onClick={save}>
          {saving ? '저장 중…' : '기록하기'}
        </button>
        {isCustom && unit === 'lb' && <p className="text-xs text-muted">직접 입력한 종목은 WOD 무게 자동 계산에는 쓰이지 않아요.</p>}
        {unit === 'time' && <p className="text-xs text-muted">시간 기록은 더 빨리 끝냈을 때 PR이에요.</p>}
      </section>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          <MyRecords me={me} records={data.records} onRemove={remove} />
          <Rankings me={me} rankings={data.rankings} />
        </>
      )}
    </BoardShell>
  );
}

// ---------------------------------------------------------------------
// 내 최고 기록: 검색 · 종류 필터 · 정렬, 종목을 누르면 그 종목 기록 변화와 삭제
// ---------------------------------------------------------------------
type Group = {
  key: string;
  label: string;
  unit: RecordUnit;
  isCustom: boolean;
  best: number;
  bestOn: string;
  lastOn: string;
  records: OneRmRecord[];
};

const valueOf = (r: OneRmRecord) => (r.unit === 'time' ? Number(r.time_sec) : Number(r.weight_lb));
const better = (unit: RecordUnit, a: number, b: number) => (unit === 'time' ? a < b : a > b);

function MyRecords({ me, records, onRemove }: { me: Me; records: OneRmRecord[]; onRemove: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'lift' | 'wod' | 'custom'>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'count'>('recent');
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of records) {
      const key = `${r.unit}:${r.is_custom ? 'custom:' : ''}${r.movement}`;
      const v = valueOf(r);
      const g = map.get(key);
      if (!g) {
        map.set(key, { key, label: movementLabel(r.movement, r.is_custom), unit: r.unit, isCustom: r.is_custom, best: v, bestOn: r.achieved_on, lastOn: r.achieved_on, records: [r] });
        continue;
      }
      g.records.push(r);
      if (better(r.unit, v, g.best)) {
        g.best = v;
        g.bestOn = r.achieved_on;
      }
      if (r.achieved_on > g.lastOn) g.lastOn = r.achieved_on;
    }
    return [...map.values()];
  }, [records]);

  const q = query.trim().toLowerCase();
  const shown = groups
    .filter((g) => (kind === 'all' ? true : kind === 'lift' ? g.unit === 'lb' && !g.isCustom : kind === 'wod' ? g.unit === 'time' && !g.isCustom : g.isCustom))
    .filter((g) => matchesSearch(q, g.key, g.label, g.isCustom))
    .sort((a, b) =>
      sort === 'name' ? a.label.localeCompare(b.label, 'ko') : sort === 'count' ? b.records.length - a.records.length : b.lastOn.localeCompare(a.lastOn),
    );

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-black">🏋️ {me.profile.nickname}님의 최고 기록</h2>
      {groups.length === 0 ? (
        <p className="card p-4 text-sm text-muted">첫 기록을 남겨보세요. 다음에 더 무겁게(시간은 더 빠르게) 하면 PR로 축하해드려요!</p>
      ) : (
        <>
          <div className="card mb-2 flex flex-col gap-2 p-3">
            <input
              type="search"
              className="input"
              placeholder="🔍 종목 찾기 (예: 스쿼트, Fran)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="종목 찾기"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', '전체'],
                  ['lift', '🏋️ 리프트'],
                  ['wod', '⏱ 네임드 WOD'],
                  ['custom', '✏️ 직접 입력'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" className={`chip ${kind === k ? 'bg-yellow' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
              <select className="input ml-auto w-auto py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="정렬">
                <option value="recent">최근 기록순</option>
                <option value="name">이름순</option>
                <option value="count">기록 많은 순</option>
              </select>
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="card p-4 text-sm text-muted">조건에 맞는 기록이 없어요</p>
          ) : (
            <ul className="card divide-y-2 divide-dashed divide-ink/15">
              {shown.map((g) => {
                const expanded = open === g.key;
                const history = [...g.records].sort((a, b) => b.achieved_on.localeCompare(a.achieved_on) || b.created_at.localeCompare(a.created_at));
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : g.key)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{g.label}</span>
                        <span className="block text-xs text-muted">
                          최고 {formatDateLabel(g.bestOn)} · 기록 {g.records.length}개
                        </span>
                      </span>
                      <span className="text-right text-lg">
                        <RecordValue unit={g.unit} weightLb={g.best} timeSec={g.best} />
                      </span>
                      <span className="text-muted" aria-hidden>{expanded ? '▴' : '▾'}</span>
                    </button>
                    {expanded && (
                      <ul className="mx-3 mb-3 rounded-md bg-[var(--bg)] px-3 py-1 text-sm">
                        {history.map((r) => {
                          const isBest = valueOf(r) === g.best;
                          return (
                            <li key={r.id} className="flex items-center gap-2 py-1.5">
                              <span className="w-24 shrink-0 text-muted">{r.achieved_on}</span>
                              <span className="flex-1">
                                <RecordValue unit={r.unit} weightLb={r.weight_lb} timeSec={r.time_sec} />
                                {isBest && <span className="ml-1 rounded bg-yellow px-1 text-[10px] font-black">최고</span>}
                              </span>
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => onRemove(r.id)} aria-label="기록 삭제">
                                ✕
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// 박스 순위: 남자 / 여자 / 전체
// ---------------------------------------------------------------------
function Rankings({ me, rankings }: { me: Me; rankings: Record<string, RankGroups> }) {
  const myGender = me.profile.gender ?? null;
  const [rankKey, setRankKey] = useState<string>('lb:back_squat');
  const [tab, setTab] = useState<'all' | Gender>(myGender ?? 'all');
  const keys = [...new Set(['lb:back_squat', ...Object.keys(rankings)])];
  const ranking = rankings[rankKey]?.[tab] ?? [];

  const labelOf = (k: string) => {
    const [u, ...rest] = k.split(':');
    const name = rest.join(':');
    const label = name.startsWith('custom:') ? name.slice(7) : movementLabel(name);
    return u === 'time' ? `⏱ ${label}` : label;
  };

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-black">🏆 박스 순위</h2>
        <select className="input w-auto" value={rankKey} onChange={(e) => setRankKey(e.target.value)} aria-label="순위 종목">
          {keys.map((k) => (
            <option key={k} value={k}>
              {labelOf(k)}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-2" role="tablist" aria-label="순위 구분">
        {(
          [
            ['M', '남자'],
            ['F', '여자'],
            ['all', '전체'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? 'btn-primary' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {!myGender && (
        <p className="mb-2 rounded-md bg-yellow/30 px-3 py-2 text-xs font-bold">
          성별을 고르면 남/여 순위에 내 기록이 나와요 ·{' '}
          <Link href="/avatar" className="underline">
            프로필에서 고르기
          </Link>
        </p>
      )}
      {ranking.length === 0 ? (
        <p className="card p-4 text-sm text-muted">아직 이 종목 기록이 없어요</p>
      ) : (
        <>
          <Podium rows={ranking.slice(0, 3)} myId={me.profile.id} />
          {ranking.length > 3 && (
            <ol className="card divide-y-2 divide-dashed divide-ink/15" start={4}>
              {ranking.slice(3).map((r, i) => (
                <li key={r.user_id} className={`flex items-center gap-3 px-4 py-2.5 ${r.user_id === me.profile.id ? 'bg-yellow/25' : ''}`}>
                  <span className="w-7 text-center font-black">{i + 4}</span>
                  <span className="flex-1 truncate font-bold">{r.nickname}</span>
                  <RecordValue unit={r.unit} weightLb={r.weight_lb} timeSec={r.time_sec} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

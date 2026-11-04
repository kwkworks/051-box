'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { MOVEMENTS, NAMED_WODS, movementLabel, type MovementKey, type NamedWodKey } from '@/lib/constants';
import { RecordValue } from '@/components/RecordValue';
import { kstToday } from '@/lib/format';
import type { Me, OneRmRecord, RankRow, RecordUnit } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function OneRmPage() {
  return <Guard need="member">{(me) => <OneRm me={me} />}</Guard>;
}

const CUSTOM = '__custom__';

function OneRm({ me }: { me: Me }) {
  const { refreshMe } = useAuth();
  const { data, error, loading, reload } = useLoad(
    () => api.get<{ records: OneRmRecord[]; rankings: Record<string, RankRow[]> }>('/one-rm'),
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
  const [rankKey, setRankKey] = useState<string>('lb:back_squat');

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

  // 종목별 내 최고 기록 (무게는 무거운 것, 시간은 빠른 것)
  const myBest = useMemo(() => {
    const map = new Map<string, { label: string; unit: RecordUnit; best: number; count: number }>();
    for (const r of data?.records ?? []) {
      const key = `${r.unit}:${r.is_custom ? 'custom:' : ''}${r.movement}`;
      const cur = map.get(key);
      const value = r.unit === 'time' ? Number(r.time_sec) : Number(r.weight_lb);
      const best = !cur ? value : r.unit === 'time' ? Math.min(cur.best, value) : Math.max(cur.best, value);
      map.set(key, { label: movementLabel(r.movement, r.is_custom), unit: r.unit, best, count: (cur?.count ?? 0) + 1 });
    }
    return [...map.entries()];
  }, [data]);

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

  const rankingKeys = Object.keys(data?.rankings ?? {});
  const ranking = data?.rankings[rankKey] ?? [];

  return (
    <BoardShell title="🏋️ 1RM 기록" subtitle="내 최고 기록(lb)과 네임드 WOD 기록, 박스 순위">
      <section className="card mb-5 flex flex-col gap-3 p-4">
        <h2 className="font-black">새 기록 남기기</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="기록 종류">
          {(
            [
              ['lb', '🏋️ 무게 (lb)'],
              ['time', '⏱ 네임드 WOD (시간)'],
            ] as const
          ).map(([u, label]) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              className={`btn ${unit === u ? 'btn-primary' : ''}`}
              onClick={() => switchUnit(u)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rm-move">{unit === 'lb' ? '종목' : 'WOD'}</label>
            <select id="rm-move" className="input" value={movement} onChange={(e) => setMovement(e.target.value)}>
              {unit === 'lb'
                ? (Object.keys(MOVEMENTS) as MovementKey[]).map((m) => (
                    <option key={m} value={m}>{MOVEMENTS[m]}</option>
                  ))
                : (Object.keys(NAMED_WODS) as NamedWodKey[]).map((m) => (
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
          <section className="mb-6">
            <h2 className="mb-2 text-lg font-black">🏋️ {me.profile.nickname}님의 최고 기록</h2>
            {myBest.length === 0 ? (
              <p className="card p-4 text-sm text-muted">첫 기록을 남겨보세요. 다음에 더 무겁게(시간은 더 빠르게) 하면 PR로 축하해드려요!</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {myBest.map(([key, v]) => (
                  <li key={key} className="card p-3">
                    <p className="truncate text-xs font-bold text-muted">{v.label}</p>
                    <p className="text-xl">
                      <RecordValue unit={v.unit} weightLb={v.best} timeSec={v.best} size="lg" />
                    </p>
                    <p className="text-xs text-muted">기록 {v.count}개</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">🏆 박스 순위</h2>
              <select className="input w-auto" value={rankKey} onChange={(e) => setRankKey(e.target.value)} aria-label="순위 종목">
                {[...new Set(['lb:back_squat', ...rankingKeys])].map((k) => {
                  const [u, ...rest] = k.split(':');
                  const name = rest.join(':');
                  const label = name.startsWith('custom:') ? name.slice(7) : movementLabel(name);
                  return (
                    <option key={k} value={k}>
                      {u === 'time' ? `⏱ ${label}` : label}
                    </option>
                  );
                })}
              </select>
            </div>
            {ranking.length === 0 ? (
              <p className="card p-4 text-sm text-muted">아직 이 종목 기록이 없어요</p>
            ) : (
              <ol className="card divide-y-2 divide-dashed divide-ink/15">
                {ranking.map((r, i) => (
                  <li key={r.user_id} className={`flex items-center gap-3 px-4 py-2.5 ${r.user_id === me.profile.id ? 'bg-yellow/25' : ''}`}>
                    <span className="w-7 text-center font-black">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                    <span className="flex-1 truncate font-bold">{r.nickname}</span>
                    <RecordValue unit={r.unit} weightLb={r.weight_lb} timeSec={r.time_sec} />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-black">📜 내 기록 이력</h2>
            {data.records.length === 0 ? (
              <p className="card p-4 text-sm text-muted">기록이 없어요</p>
            ) : (
              <ul className="card divide-y-2 divide-dashed divide-ink/15">
                {data.records.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 shrink-0 text-muted">{r.achieved_on}</span>
                    <span className="flex-1 truncate font-bold">{movementLabel(r.movement, r.is_custom)}</span>
                    <RecordValue unit={r.unit} weightLb={r.weight_lb} timeSec={r.time_sec} />
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(r.id)} aria-label="기록 삭제">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </BoardShell>
  );
}

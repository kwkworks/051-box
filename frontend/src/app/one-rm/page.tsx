'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { MOVEMENTS, movementLabel, type MovementKey } from '@/lib/constants';
import { kstToday } from '@/lib/format';
import type { Me, OneRmRecord, RankRow } from '@/lib/types';
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
  const [movement, setMovement] = useState<string>('back_squat');
  const [customName, setCustomName] = useState('');
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(kstToday());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rankKey, setRankKey] = useState<string>('back_squat');

  const isCustom = movement === CUSTOM;
  const weightNum = Number(weight);
  const valid = weightNum > 0 && weightNum <= 500 && (weightNum * 2) % 1 === 0 && (!isCustom || customName.trim().length > 0);

  // 종목별 내 최고 기록
  const myBest = useMemo(() => {
    const map = new Map<string, { label: string; best: number; count: number }>();
    for (const r of data?.records ?? []) {
      const key = r.is_custom ? `custom:${r.movement}` : r.movement;
      const cur = map.get(key);
      map.set(key, {
        label: movementLabel(r.movement, r.is_custom),
        best: Math.max(cur?.best ?? 0, r.weight_kg),
        count: (cur?.count ?? 0) + 1,
      });
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
        weight_kg: weightNum,
        achieved_on: date,
      });
      setMessage({ ok: true, text: res.isPr ? '🎉 PR 달성! 명예의 벽에 올라갔어요' : '기록했어요' });
      setWeight('');
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
    <BoardShell title="바벨 랙 · 1RM" subtitle="내 최고 기록과 박스 순위">
      <section className="card mb-5 flex flex-col gap-3 p-4">
        <h2 className="font-black">새 기록 남기기</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rm-move">종목</label>
            <select id="rm-move" className="input" value={movement} onChange={(e) => setMovement(e.target.value)}>
              {(Object.keys(MOVEMENTS) as MovementKey[]).map((m) => (
                <option key={m} value={m}>{MOVEMENTS[m]}</option>
              ))}
              <option value={CUSTOM}>직접 입력…</option>
            </select>
          </div>
          {isCustom && (
            <div>
              <label className="label" htmlFor="rm-custom">종목 이름</label>
              <input id="rm-custom" className="input" maxLength={30} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="예: 행 클린" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="rm-weight">무게 (kg, 0.5 단위)</label>
            <input id="rm-weight" type="number" inputMode="decimal" step={0.5} min={0.5} max={500} className="input" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="rm-date">날짜</label>
            <input id="rm-date" type="date" max={kstToday()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {message && <p className={`text-sm font-bold ${message.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`} role="status">{message.text}</p>}
        <button type="button" className="btn btn-primary h-12" disabled={saving || !valid} onClick={save}>
          {saving ? '저장 중…' : '기록하기'}
        </button>
        {isCustom && <p className="text-xs text-muted">직접 입력한 종목은 WOD 무게 자동 계산에는 쓰이지 않아요.</p>}
      </section>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-lg font-black">🏋️ {me.profile.nickname}님의 최고 기록</h2>
            {myBest.length === 0 ? (
              <p className="card p-4 text-sm text-muted">첫 기록을 남겨보세요. 다음에 더 무겁게 들면 PR로 축하해드려요!</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {myBest.map(([key, v]) => (
                  <li key={key} className="card p-3">
                    <p className="truncate text-xs font-bold text-muted">{v.label}</p>
                    <p className="text-2xl font-black">{v.best}<span className="text-sm">kg</span></p>
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
                {[...new Set(['back_squat', ...rankingKeys])].map((k) => (
                  <option key={k} value={k}>{k.startsWith('custom:') ? k.slice(7) : movementLabel(k)}</option>
                ))}
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
                    <span className="font-black">{r.weight_kg}kg</span>
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
                    <span className="font-black">{r.weight_kg}kg</span>
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

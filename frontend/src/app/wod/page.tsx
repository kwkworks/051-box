'use client';

import { useState } from 'react';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { MOVEMENTS, movementLabel, type MovementKey } from '@/lib/constants';
import { fmtLb, formatDateLabel, kstToday, lbToKg, percentWeight, shiftDate } from '@/lib/format';
import type { Lift, Me, Wod, WodPhoto } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function WodPage() {
  return <Guard need="member">{(me) => <WodBoard me={me} />}</Guard>;
}

function WodBoard({ me }: { me: Me }) {
  const today = kstToday();
  const [date, setDate] = useState(today);
  const isAdmin = me.profile.role === 'admin';
  const { data, error, loading, reload } = useLoad(
    () => api.get<{ wod: Wod | null; photos: WodPhoto[]; locked?: boolean; opensAt?: string; released?: boolean }>(`/wods?date=${date}`),
    date,
  );
  const [editing, setEditing] = useState(false);
  const goTo = (next: string) => {
    setDate(next);
    setEditing(false);
  };

  const dayName = date === today ? '오늘' : date === shiftDate(today, 1) ? '내일' : date === shiftDate(today, -1) ? '어제' : '';

  return (
    <BoardShell title="📋 오늘의 WOD" subtitle="WOD · 내 무게 · 기록 사진">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" className="btn btn-sm" onClick={() => goTo(shiftDate(date, -1))}>
          ← 이전
        </button>
        <div className="text-center">
          <p className="text-lg font-black">{formatDateLabel(date)}</p>
          {dayName && <p className="text-xs font-bold text-[var(--burgundy)]">{dayName}</p>}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => goTo(shiftDate(date, 1))}>
          다음 →
        </button>
      </div>
      {date !== today && (
        <button type="button" className="btn btn-sm mb-4 w-full" onClick={() => goTo(today)}>
          오늘로
        </button>
      )}

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && data && (
        <>
          {editing && isAdmin ? (
            <WodEditor date={date} wod={data.wod} onDone={() => { setEditing(false); reload(); }} />
          ) : data.locked ? (
            <div className="card p-6 text-center">
              <p className="text-3xl" aria-hidden>🔒</p>
              <p className="mt-2 font-bold">아직 공개 전이에요</p>
              <p className="mt-1 text-sm text-muted">{opensLabel(data.opensAt, today)}에 공개돼요</p>
            </div>
          ) : data.wod ? (
            <>
              {isAdmin && data.released === false && (
                <p className="mb-2 rounded-md bg-yellow/30 px-3 py-2 text-xs font-bold">
                  🔒 회원에게는 {opensLabel(data.opensAt, today)}에 공개돼요 (관리자만 미리 보는 중)
                </p>
              )}
              <WodView wod={data.wod} bestLifts={me.bestLifts} />
            </>
          ) : (
            <div className="card p-6 text-center text-muted">
              <p className="font-bold">아직 올라온 WOD가 없어요</p>
              {isAdmin && <p className="mt-1 text-sm">아래 버튼으로 작성해주세요.</p>}
            </div>
          )}

          {isAdmin && !editing && !data.locked && (
            <button type="button" className="btn btn-dark mt-3 w-full" onClick={() => setEditing(true)}>
              {data.wod ? 'WOD 수정' : 'WOD 작성'}
            </button>
          )}

          {data.wod && <Photos wodId={data.wod.id} photos={data.photos} isAdmin={isAdmin} onChange={reload} />}
        </>
      )}
    </BoardShell>
  );
}

// 공개 시각 안내: "오늘 오후 8시 30분" / "11월 6일 (금) 오후 8시 30분"
function opensLabel(iso: string | undefined, today: string) {
  if (!iso) return '전날 오후 8시 30분';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso));
  return `${day === today ? '오늘' : formatDateLabel(day)} 오후 8시 30분`;
}

// WOD 본문: [Strength], [Conditioning] 같은 구역 제목 줄은 굵게
const SECTION_LINE = /^\s*\[[^\]\n]{1,30}\]\s*$/;
function WodContent({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words px-4 py-4 text-[15px] leading-relaxed">
      {text.split('\n').map((line, i) =>
        SECTION_LINE.test(line) ? (
          <p key={i} className={`font-black text-[var(--burgundy)] ${i ? 'mt-1' : ''}`}>
            {line.trim()}
          </p>
        ) : (
          <p key={i}>{line || ' '}</p>
        ),
      )}
    </div>
  );
}

function WodView({ wod, bestLifts }: { wod: Wod; bestLifts: Record<string, number> }) {
  return (
    <article className="card overflow-hidden">
      <div className="border-b-2 border-ink bg-white px-4 py-3">
        <h2 className="text-xl font-black text-[#C2453A]">{wod.title}</h2>
      </div>
      {wod.content && <WodContent text={wod.content} />}
      {wod.lifts.length > 0 && (
        <div className="border-t-2 border-dashed border-ink/30 bg-[var(--bg)] px-4 py-4">
          <h3 className="mb-2 text-sm font-black">🏋️ 내 무게 (1RM 기준 정확한 값)</h3>
          <div className="flex flex-col gap-3">
            {wod.lifts.map((lift, i) => {
              const best = bestLifts[lift.movement];
              return (
                <div key={i}>
                  <p className="text-sm font-bold">
                    {movementLabel(lift.movement)}
                    {best ? <span className="ml-2 text-muted">1RM {fmtLb(best)} ({lbToKg(best)} kg)</span> : null}
                  </p>
                  {best ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {lift.percents.map((p, j) => (
                        <span key={j} className="chip bg-yellow">
                          {p}% → {fmtLb(percentWeight(best, p))} <span className="font-normal">({lbToKg(percentWeight(best, p))} kg)</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">
                      {lift.percents.map((p) => `${p}%`).join(' · ')} — 1RM 게시판에 기록하면 무게가 자동 계산돼요
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

function WodEditor({ date, wod, onDone }: { date: string; wod: Wod | null; onDone: () => void }) {
  const [title, setTitle] = useState(wod?.title ?? '');
  const [content, setContent] = useState(wod?.content ?? '');
  const [lifts, setLifts] = useState<Lift[]>(wod?.lifts ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/wods/${date}`, { title, content, lifts: lifts.filter((l) => l.percents.length) });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!wod || !confirm('이 날짜의 WOD와 기록 사진을 삭제할까요?')) return;
    try {
      await api.del(`/wods/${wod.id}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했어요');
    }
  };

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div>
        <label className="label" htmlFor="wod-title">제목</label>
        <input id="wod-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For Time: 4 Rounds" />
      </div>
      <div>
        <label className="label" htmlFor="wod-content">내용</label>
        <textarea
          id="wod-content"
          className="input min-h-48"
          maxLength={4000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'[Strength]\nBack Squat 5-5-5\n\n[Conditioning]\n25 W.B.S\n15 C2B'}
        />
      </div>
      <div>
        <p className="label">강도 계산 항목 (회원별 무게 자동 계산)</p>
        {lifts.map((lift, i) => (
          <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
            <select
              className="input w-auto"
              value={lift.movement}
              onChange={(e) => setLifts(lifts.map((l, j) => (j === i ? { ...l, movement: e.target.value } : l)))}
            >
              {(Object.keys(MOVEMENTS) as MovementKey[]).map((m) => (
                <option key={m} value={m}>{MOVEMENTS[m]}</option>
              ))}
            </select>
            <input
              className="input w-44"
              defaultValue={lift.percents.join(', ')}
              placeholder="70, 75, 80"
              aria-label="퍼센트 (쉼표로 구분)"
              onChange={(e) => {
                const percents = e.target.value
                  .split(/[,\s]+/)
                  .map(Number)
                  .filter((n) => Number.isInteger(n) && n >= 30 && n <= 120)
                  .slice(0, 10);
                setLifts(lifts.map((l, j) => (j === i ? { ...l, percents } : l)));
              }}
            />
            <span className="text-xs text-muted">%</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setLifts(lifts.filter((_, j) => j !== i))}>
              삭제
            </button>
          </div>
        ))}
        {lifts.length < 10 && (
          <button type="button" className="btn btn-sm" onClick={() => setLifts([...lifts, { movement: 'back_squat', percents: [] }])}>
            + 항목 추가
          </button>
        )}
      </div>
      {error && <p className="text-sm font-bold text-[var(--danger)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-dark flex-1" disabled={saving || !title.trim()} onClick={save}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="btn" onClick={onDone}>취소</button>
        {wod && <button type="button" className="btn btn-danger" onClick={remove}>삭제</button>}
      </div>
    </div>
  );
}

function Photos({ wodId, photos, isAdmin, onChange }: { wodId: string; photos: WodPhoto[]; isAdmin: boolean; onChange: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('사진은 5MB 이하만 올릴 수 있어요');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      await api.upload(`/wods/${wodId}/photos`, form);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : '올리지 못했어요');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 사진을 삭제할까요?')) return;
    try {
      await api.del(`/wods/${wodId}/photos/${id}`);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했어요');
    }
  };

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-black">📸 오늘의 기록</h2>
      {photos.length === 0 && <p className="card p-4 text-sm text-muted">수업이 끝나면 코치님이 화이트보드 사진을 올려줘요.</p>}
      <div className="grid grid-cols-2 gap-3">
        {photos.map((p) =>
          p.url ? (
            <div key={p.id} className="card relative overflow-hidden">
              <button type="button" className="block w-full" onClick={() => setZoom(p.url)} aria-label="사진 크게 보기">
                {/* 서명된 비공개 URL이라 next/image 대신 img 사용 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="화이트보드 기록 사진" className="aspect-[4/3] w-full object-cover" loading="lazy" />
              </button>
              {isAdmin && (
                <button type="button" className="btn btn-sm btn-danger absolute right-2 top-2" onClick={() => remove(p.id)}>
                  삭제
                </button>
              )}
            </div>
          ) : null,
        )}
      </div>
      {isAdmin && (
        <label className="btn btn-primary mt-3 w-full cursor-pointer">
          {uploading ? '올리는 중…' : '+ 기록 사진 올리기'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {error && <p className="mt-2 text-sm font-bold text-[var(--danger)]">{error}</p>}
      {zoom && (
        <button type="button" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(null)} aria-label="닫기">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="화이트보드 기록 사진 크게 보기" className="max-h-full max-w-full rounded-md" />
        </button>
      )}
    </section>
  );
}

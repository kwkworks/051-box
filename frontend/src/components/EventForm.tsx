'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { isoToLocalInput, localInputToIso } from '@/lib/format';
import type { BoxEvent, EventKind } from '@/lib/types';

// 일정 등록/수정 양식. initial이 있으면 그 일정을 수정한다 (종류는 바꿀 수 없음).
export function EventForm({ kind, initial, onDone, onCancel }: { kind: EventKind; initial?: BoxEvent; onDone: () => void; onCancel?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startsAt, setStartsAt] = useState(initial ? isoToLocalInput(initial.starts_at) : '');
  const [deadline, setDeadline] = useState(initial?.signup_deadline ? isoToLocalInput(initial.signup_deadline) : '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [link, setLink] = useState(initial?.link_url ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : '');
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
      const fields = {
        title,
        description,
        starts_at: localInputToIso(startsAt),
        location,
        link_url: link || null,
        signup_deadline: deadline ? localInputToIso(deadline) : null,
        capacity: capacity ? Number(capacity) : null,
      };
      if (initial) await api.patch(`/events/${initial.id}`, fields);
      else await api.post('/events', { kind, ...fields });
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
          {saving ? '저장 중…' : initial ? '수정 저장' : '등록'}
        </button>
        <button type="button" className="btn" onClick={onCancel ?? onDone}>취소</button>
      </div>
    </div>
  );
}

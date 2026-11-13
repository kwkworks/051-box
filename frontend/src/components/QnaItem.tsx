'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import type { QnaQuestion } from '@/lib/types';

// Q&A 문의 한 건. 눌러서 펼치면 내용과 답변이 보인다.
// 쓴 사람·관리자: 삭제 / 관리자: 답변 달기·고치기·지우기
export function QnaItem({
  q,
  isAdmin,
  onDelete,
  onAnswer,
}: {
  q: QnaQuestion;
  isAdmin: boolean;
  onDelete: () => Promise<void>;
  onAnswer: (answer: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = Boolean(q.answer);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card overflow-hidden">
      <button type="button" className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span
          className={`chip shrink-0 whitespace-nowrap ${answered ? 'border-[var(--ok)] text-[var(--ok)]' : 'text-muted'}`}
        >
          {answered ? '답변 완료' : '답변 대기'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold">{q.title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {isAdmin && !q.mine ? `${q.nickname} · ` : ''}
            {formatDateTime(q.created_at)}
          </span>
        </span>
        <span className="shrink-0 text-muted" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-dashed border-ink/20 px-4 pb-4 pt-3">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{q.body}</p>

          {answered && !editing && (
            <div className="mt-3 rounded-lg border-2 border-ink/20 bg-[var(--bg)] p-3">
              <p className="mb-1 text-xs font-black text-[var(--burgundy)]">
                💬 관리자 답변{q.answered_at ? ` · ${formatDateTime(q.answered_at)}` : ''}
              </p>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{q.answer}</p>
            </div>
          )}
          {!answered && !isAdmin && <p className="mt-3 text-sm text-muted">관리자가 확인하고 답변을 남겨드릴게요.</p>}

          {isAdmin && (editing || !answered) && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="label" htmlFor={`ans-${q.id}`}>
                답변
              </label>
              <textarea
                id={`ans-${q.id}`}
                className="input min-h-24"
                maxLength={2000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="답변을 입력하세요"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-dark" disabled={busy || !draft.trim()} onClick={() => run(() => onAnswer(draft))}>
                  {busy ? '저장 중…' : answered ? '답변 수정' : '답변 달기'}
                </button>
                {editing && (
                  <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>
                    취소
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm font-bold text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {isAdmin && answered && !editing && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setDraft(q.answer ?? '');
                    setEditing(true);
                  }}
                >
                  ✏️ 답변 수정
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => confirm('답변을 지울까요?') && run(() => onAnswer(null))}
                >
                  답변 지우기
                </button>
              </>
            )}
            {(q.mine || isAdmin) && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => confirm('이 문의를 삭제할까요? 답변도 함께 지워져요.') && run(onDelete)}
              >
                문의 삭제
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

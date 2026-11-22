'use client';

import { useState } from 'react';
import { formatRelative } from '@/lib/format';
import type { EventComment } from '@/lib/types';

// 회원 모임 댓글 (보이는 부분). 쓴 사람은 자기 댓글을, 관리자는 모든 댓글을 지울 수 있다
export function EventComments({
  comments,
  myId,
  isAdmin,
  loading,
  error,
  onSend,
  onDelete,
}: {
  comments: EventComment[];
  myId: string;
  isAdmin: boolean;
  loading?: boolean;
  error?: string | null;
  onSend: (body: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onSend(body);
    setSending(false);
    if (ok) setText('');
  };

  return (
    <section className="mt-6" aria-label="댓글">
      <h3 className="mb-2 font-black">💬 댓글 {comments.length}개</h3>
      {loading && comments.length === 0 && <p className="card p-4 text-sm text-muted">불러오는 중…</p>}
      {!loading && comments.length === 0 && <p className="card p-4 text-sm text-muted">첫 댓글을 남겨 보세요!</p>}
      {comments.length > 0 && (
        <ul className="card divide-y-2 divide-dashed divide-ink/15 overflow-hidden">
          {comments.map((c) => {
            const canDelete = c.user_id === myId || isAdmin;
            return (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 truncate font-black">{c.nickname}</span>
                  {c.role === 'admin' && <span className="shrink-0 rounded bg-yellow px-1 text-[10px] font-black text-ink">관리자</span>}
                  <span className="shrink-0 text-xs text-muted">{formatRelative(c.created_at)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      className="ml-auto shrink-0 text-xs font-bold text-muted underline"
                      onClick={() => onDelete(c.id)}
                      aria-label={`${c.nickname}님의 댓글 삭제`}
                    >
                      삭제
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-sm font-bold text-[var(--danger)]" role="alert">{error}</p>}
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="input min-h-20 text-[15px]"
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="댓글을 남겨 주세요 (300자까지)"
          aria-label="댓글 입력"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{text.length}/300</span>
          <button type="submit" className="btn btn-primary btn-sm shrink-0 whitespace-nowrap" disabled={sending || !text.trim()}>
            {sending ? '등록 중…' : '댓글 등록'}
          </button>
        </div>
      </form>
    </section>
  );
}

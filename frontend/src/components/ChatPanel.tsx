'use client';

import { Fragment, forwardRef, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSession } from '@/lib/types';

const GRACE_MS = 90_000;

function time(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// 메시지가 어느 접속(세션) 중에 오갔는지
function sessionOf(m: ChatMessage, sessions: ChatSession[], currentId: string | null): string | null {
  const t = new Date(m.created_at).getTime();
  for (const s of sessions) {
    const end = s.id === currentId ? Infinity : new Date(s.last_seen).getTime() + GRACE_MS;
    if (t >= new Date(s.started_at).getTime() && t <= end) return s.id;
  }
  return null;
}

// 박스 채팅: 오늘, 내가 접속해 있던 동안의 대화만. 이전 접속 대화는 구분선 위에 보여준다.
// Enter로 입력창 열기, Enter로 보내기, Esc로 닫기
export const ChatPanel = forwardRef<
  HTMLInputElement,
  {
    messages: ChatMessage[];
    sessions: ChatSession[];
    currentSessionId: string | null;
    myId: string;
    canModerate: boolean;
    blockedReason: string | null;
    onSend: (text: string) => Promise<boolean>;
    onDelete: (id: string) => void;
  }
>(function ChatPanel({ messages, sessions, currentSessionId, myId, canModerate, blockedReason, onSend, onDelete }, inputRef) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const visible = open ? messages : messages.slice(-3);

  const submit = async () => {
    const value = text.trim();
    const input = typeof inputRef === 'object' ? inputRef?.current : null;
    if (!value) {
      input?.blur(); // 빈 채로 Enter → 입력 끝내고 다시 걷기
      return;
    }
    setSending(true);
    const ok = await onSend(value);
    setSending(false);
    if (ok) {
      setText('');
      input?.blur();
    }
  };

  let prevSession: string | null | undefined;

  return (
    <section
      className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-lg border-2 border-black/70 bg-black/70 text-white sm:w-96"
      aria-label="박스 채팅"
    >
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="font-bold">
          💬 오늘의 박스 채팅 <span className="font-normal text-white/60">(내가 있던 동안)</span>
        </span>
        <button type="button" className="rounded px-2 py-0.5 font-bold hover:bg-white/10" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '접기 ▾' : '기록 보기 ▴'}
        </button>
      </div>
      <div ref={listRef} className={`overflow-y-auto px-3 ${open ? 'max-h-[40vh]' : 'max-h-24'}`} aria-live="polite">
        {visible.length === 0 && <p className="py-1 text-xs text-white/60">아직 대화가 없어요. 먼저 인사해보세요!</p>}
        {visible.map((m) => {
          const sid = sessionOf(m, sessions, currentSessionId);
          const showDivider = open && sid !== prevSession;
          prevSession = sid;
          const s = sessions.find((x) => x.id === sid);
          return (
            <Fragment key={m.id}>
              {showDivider && (
                <div className="my-2 flex items-center gap-2 text-[11px] font-bold" role="separator">
                  <span className={`h-0.5 flex-1 ${sid === currentSessionId ? 'bg-green-400/70' : 'bg-yellow/70'}`} />
                  <span className={`shrink-0 rounded-full px-2 py-0.5 ${sid === currentSessionId ? 'bg-green-500/30 text-green-200' : 'bg-yellow/25 text-yellow'}`}>
                    {sid === currentSessionId
                      ? `지금 접속 ${s ? time(s.started_at) : ''}~`
                      : s
                        ? `이전 접속 ${time(s.started_at)} ~ ${time(s.last_seen)} 대화`
                        : '이전 대화'}
                  </span>
                  <span className={`h-0.5 flex-1 ${sid === currentSessionId ? 'bg-green-400/70' : 'bg-yellow/70'}`} />
                </div>
              )}
              <p className={`group break-words py-0.5 text-[13px] leading-snug ${sid !== currentSessionId ? 'opacity-70' : ''}`}>
                <span className="mr-1 text-[11px] text-white/50">{time(m.created_at)}</span>
                <span className={`mr-1 font-bold ${m.user_id === myId ? 'text-yellow' : 'text-sky-300'}`}>{m.nickname}</span>
                {m.body}
                {(m.user_id === myId || canModerate) && open && (
                  <button
                    type="button"
                    className="ml-1 hidden text-[11px] text-white/50 hover:text-red-300 group-hover:inline"
                    onClick={() => onDelete(m.id)}
                    aria-label="메시지 삭제"
                  >
                    삭제
                  </button>
                )}
              </p>
            </Fragment>
          );
        })}
      </div>
      {blockedReason ? (
        <p className="m-2 rounded bg-white/10 px-3 py-2 text-center text-xs font-bold text-yellow" role="status">
          {blockedReason}
        </p>
      ) : (
        <form
          className="flex gap-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            className="input min-h-9 flex-1 bg-white/95 py-1 text-sm text-ink"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
            placeholder="Enter를 눌러 채팅 (최대 200자)"
            aria-label="채팅 메시지"
          />
          <button type="submit" className="btn btn-sm h-9" disabled={sending}>
            전송
          </button>
        </form>
      )}
    </section>
  );
});

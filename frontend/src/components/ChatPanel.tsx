'use client';

import { Fragment, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSession } from '@/lib/types';

const GRACE_MS = 90_000;
const POS_KEY = 'box-chat-pos';
const MIN_KEY = 'box-chat-min';

type Pos = { x: number; y: number };

export type ChatPanelHandle = { focus: () => void };

function readPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  } catch {}
  return null;
}

function readMinimized(): boolean {
  try {
    const v = localStorage.getItem(MIN_KEY);
    if (v !== null) return v === '1';
  } catch {}
  // 휴대폰은 처음에 접어 둔다 (화면을 가리지 않게)
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

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
// Enter로 입력창 열기, Enter로 보내기, Esc로 닫기.
// 손잡이(⠿)를 끌어서 옮길 수 있고, 접으면 작은 버튼만 남는다. 위치와 접힘 상태는 이 기기에 저장.
export const ChatPanel = forwardRef<
  ChatPanelHandle,
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
>(function ChatPanel({ messages, sessions, currentSessionId, myId, canModerate, blockedReason, onSend, onDelete }, ref) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(readMinimized);
  const [pos, setPos] = useState<Pos | null>(readPos);
  const [seen, setSeen] = useState(messages.length);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean; last?: Pos } | null>(null);

  const unread = minimized ? Math.max(0, messages.length - seen) : 0;

  const setMin = (v: boolean) => {
    setMinimized(v);
    setSeen(messages.length);
    try {
      localStorage.setItem(MIN_KEY, v ? '1' : '0');
    } catch {}
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (minimized) setMin(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  }));

  // 화면 밖으로 나가지 않게 위치를 맞춘다
  const clamp = (p: Pos): Pos => {
    const el = boxRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return p;
    const maxX = Math.max(4, parent.clientWidth - el.offsetWidth - 4);
    const maxY = Math.max(4, parent.clientHeight - el.offsetHeight - 4);
    return { x: Math.min(maxX, Math.max(4, p.x)), y: Math.min(maxY, Math.max(4, p.y)) };
  };

  // 창 크기나 패널 크기가 바뀌면 다시 화면 안으로
  useLayoutEffect(() => {
    const el = boxRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const fit = () =>
      setPos((p) => {
        if (!p) return p;
        const c = clamp(p);
        return c.x === p.x && c.y === p.y ? p : c;
      });
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(parent);
    return () => ro.disconnect();
  });

  const onDragStart = (e: React.PointerEvent) => {
    const el = boxRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: el.offsetLeft, y: el.offsetTop, moved: false };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    d.last = clamp({ x: d.x + dx, y: d.y + dy });
    setPos(d.last);
  };
  const onDragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || !d.last) return;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(d.last));
    } catch {}
  };
  const resetPos = () => {
    setPos(null);
    try {
      localStorage.removeItem(POS_KEY);
    } catch {}
  };

  const placement: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { left: 12, bottom: 12 };
  const handleProps = {
    onPointerDown: onDragStart,
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
    onDoubleClick: resetPos,
    style: { touchAction: 'none' } as React.CSSProperties,
  };

  // 새 메시지가 오면 맨 아래로
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const visible = open ? messages : messages.slice(-3);

  const submit = async () => {
    const value = text.trim();
    const input = inputRef.current;
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

  if (minimized) {
    const last = messages[messages.length - 1];
    return (
      <section
        ref={boxRef}
        className="absolute z-20 flex items-stretch overflow-hidden rounded-full border-2 border-black/70 bg-black/75 text-white"
        style={placement}
        aria-label="박스 채팅 (접힘)"
      >
        <span
          className="flex cursor-grab items-center pl-2.5 pr-1 text-white/50 active:cursor-grabbing"
          aria-label="채팅 옮기기"
          title="끌어서 옮기기 · 두 번 눌러 제자리"
          {...handleProps}
        >
          ⠿
        </span>
        <button
          type="button"
          className="flex max-w-[55vw] items-center gap-1.5 py-2 pl-1 pr-3 text-xs font-bold sm:max-w-72"
          onClick={() => setMin(false)}
          aria-label="채팅 펼치기"
        >
          💬
          <span className="truncate font-normal text-white/80">{last ? `${last.nickname}: ${last.body}` : '채팅'}</span>
          {unread > 0 && (
            <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{unread > 99 ? '99+' : unread}</span>
          )}
        </button>
      </section>
    );
  }

  return (
    <section
      ref={boxRef}
      className="absolute z-20 flex w-[min(24rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border-2 border-black/70 bg-black/70 text-white"
      style={placement}
      aria-label="박스 채팅"
    >
      <div className="flex items-center gap-1 py-1 pl-1 pr-1.5 text-xs">
        <span
          className="flex h-7 cursor-grab items-center rounded px-1.5 text-white/50 hover:bg-white/10 active:cursor-grabbing"
          aria-label="채팅 옮기기"
          title="끌어서 옮기기 · 두 번 눌러 제자리"
          {...handleProps}
        >
          ⠿
        </span>
        <span className="min-w-0 flex-1 truncate font-bold">
          💬 오늘의 박스 채팅 <span className="hidden font-normal text-white/60 sm:inline">(내가 있던 동안)</span>
        </span>
        <button type="button" className="shrink-0 rounded px-2 py-1 font-bold hover:bg-white/10" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '기록 ▾' : '기록 ▴'}
        </button>
        <button type="button" className="shrink-0 rounded px-2 py-1 font-bold hover:bg-white/10" onClick={() => setMin(true)} aria-label="채팅 접기" title="접기">
          ✕
        </button>
      </div>
      <div ref={listRef} className={`overflow-y-auto px-3 ${open ? 'max-h-[35vh]' : 'max-h-20 sm:max-h-24'}`} aria-live="polite">
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

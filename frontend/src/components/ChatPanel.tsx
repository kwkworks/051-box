'use client';

import { Fragment, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

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

// 박스 채팅: 오늘(0시부터) 대화 전체. 다시 들어오면 "여기까지 읽었어요" 구분선으로 읽던 곳을 보여주고,
// 내가 보내면 가장 최신 대화로 이동한다. Enter로 입력창 열기, Enter로 보내기, Esc로 닫기.
// 손잡이(⠿)를 끌어서 옮길 수 있고, 접으면 작은 버튼만 남는다. 위치와 접힘 상태는 이 기기에 저장.
export const ChatPanel = forwardRef<
  ChatPanelHandle,
  {
    messages: ChatMessage[];
    markerAt: string | null; // "여기까지 읽었어요" 구분선 위치 (들어올 때 읽었던 곳)
    readAt: string | null; // 지금까지 읽은 곳 (안 읽은 수 계산)
    myId: string;
    canModerate: boolean;
    blockedReason: string | null;
    onSend: (text: string) => Promise<boolean>;
    onDelete: (id: string) => void;
    onMinimizedChange?: (minimized: boolean) => void;
    onRead?: (at: string) => void;
  }
>(function ChatPanel({ messages, markerAt, readAt, myId, canModerate, blockedReason, onSend, onDelete, onMinimizedChange, onRead }, ref) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(readMinimized);
  const [pos, setPos] = useState<Pos | null>(readPos);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean; last?: Pos } | null>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true); // 맨 아래를 보고 있으면 새 메시지가 와도 계속 맨 아래
  const scrollTo = useRef<'marker' | 'bottom' | null>('marker');

  const readTime = readAt ? Date.parse(readAt) : 0;
  const unread = messages.filter((m) => m.user_id !== myId && Date.parse(m.created_at) > readTime).length;
  // 구분선: 들어올 때 읽었던 곳 다음의 첫 메시지 앞
  const markerTime = markerAt ? Date.parse(markerAt) : null;
  const firstNewIdx = markerTime === null ? -1 : messages.findIndex((m) => Date.parse(m.created_at) > markerTime && m.user_id !== myId);

  // 펼쳐져 있는지 바깥(박스 화면)에 알려서 휴대폰에서는 겹치는 버튼을 숨기게 한다
  useEffect(() => {
    onMinimizedChange?.(minimized);
  }, [minimized, onMinimizedChange]);

  const setMin = (v: boolean) => {
    setMinimized(v);
    if (!v) {
      // 펼칠 때 안 읽은 게 여러 개면 기록을 열고 읽던 곳으로
      if (unread > 3) setOpen(true);
      scrollTo.current = unread > 0 ? 'marker' : 'bottom';
    }
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

  // 스크롤: 처음/펼칠 때는 읽던 곳, 새 메시지는 맨 아래를 보고 있을 때만 따라 내려간다, 내가 보낸 건 항상 맨 아래
  const lastMine = messages.length > 0 && messages[messages.length - 1].user_id === myId;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const want = scrollTo.current;
    scrollTo.current = null;
    if (want === 'marker' && markerRef.current) {
      el.scrollTop = markerRef.current.offsetTop - 8;
    } else if (want === 'bottom' || want === 'marker' || stickBottom.current || lastMine) {
      el.scrollTop = el.scrollHeight;
    }
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, [messages.length, open, minimized, lastMine]);

  // 맨 아래까지 보고 있으면 "읽음"으로 저장
  const latest = messages.length ? messages[messages.length - 1].created_at : null;
  useEffect(() => {
    if (minimized || !latest || !stickBottom.current || document.visibilityState !== 'visible') return;
    if (Date.parse(latest) > readTime) onRead?.(latest);
  }, [latest, minimized, readTime, onRead, open]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (stickBottom.current && latest && Date.parse(latest) > readTime) onRead?.(latest);
  };

  // 접은 화면에서는 최근 3개 (읽던 곳 구분선이 그 안에 있으면 함께 보여준다)
  const start = open ? 0 : Math.max(0, messages.length - 3);
  const visible = messages.slice(start);

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
      scrollTo.current = 'bottom';
      setText('');
      input?.blur();
    }
  };

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
      className="absolute z-30 flex w-[min(24rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border-2 border-black/70 bg-black/70 text-white"
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
          💬 오늘의 박스 채팅 <span className="hidden font-normal text-white/60 sm:inline">(0시부터)</span>
        </span>
        <button type="button" className="shrink-0 rounded px-2 py-1 font-bold hover:bg-white/10" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '기록 ▾' : '기록 ▴'}
        </button>
        <button type="button" className="shrink-0 rounded px-2 py-1 font-bold hover:bg-white/10" onClick={() => setMin(true)} aria-label="채팅 접기" title="접기">
          ✕
        </button>
      </div>
      <div ref={listRef} onScroll={onScroll} className={`relative overflow-y-auto px-3 ${open ? 'max-h-[35vh]' : 'max-h-20 sm:max-h-24'}`} aria-live="polite">
        {visible.length === 0 && <p className="py-1 text-xs text-white/60">아직 대화가 없어요. 먼저 인사해보세요!</p>}
        {visible.map((m, i) => {
          const idx = start + i;
          const showMarker = idx === firstNewIdx && idx > 0;
          const old = firstNewIdx > 0 && idx < firstNewIdx;
          return (
            <Fragment key={m.id}>
              {showMarker && (
                <div ref={markerRef} className="my-2 flex items-center gap-2 text-[11px] font-bold" role="separator">
                  <span className="h-0.5 flex-1 bg-yellow/80" />
                  <span className="shrink-0 rounded-full bg-yellow/25 px-2 py-0.5 text-yellow">여기까지 읽었어요 · 새 메시지</span>
                  <span className="h-0.5 flex-1 bg-yellow/80" />
                </div>
              )}
              <p className={`group break-words py-0.5 text-[13px] leading-snug ${old ? 'opacity-70' : ''}`}>
                <span className="mr-1 text-[11px] text-white/50">{time(m.created_at)}</span>
                {m.role === 'admin' && (
                  <span className="mr-1 rounded bg-yellow px-1 text-[10px] font-black text-ink" title="관리자">
                    관리자
                  </span>
                )}
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
            onBlur={() => {
              // 아이폰은 키보드가 내려간 뒤에도 화면을 위로 밀어 둔 채 남길 때가 있다 → 제자리로
              setTimeout(() => {
                if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
              }, 50);
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

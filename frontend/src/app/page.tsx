'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { ChatPanel, type ChatPanelHandle } from '@/components/ChatPanel';
import { Guard } from '@/components/Guard';
import { ActionPad } from '@/components/ActionPad';
import { BgmControl } from '@/components/BgmControl';
import { QuickMenu } from '@/components/QuickMenu';
import { BoxSpace, type ActionState, type BoxSpaceHandle } from '@/game/BoxSpace';
import { BOARDS, type ObjectKey } from '@/game/map';
import { api } from '@/lib/api';
import type { ChatMessage, ChatSession, ChatState, Me } from '@/lib/types';

export default function HomePage() {
  return <Guard need="member">{(me) => <Space me={me} />}</Guard>;
}

function Space({ me }: { me: Me }) {
  const router = useRouter();
  const { setMe } = useAuth();
  const spaceRef = useRef<BoxSpaceHandle | null>(null);
  const chatInputRef = useRef<ChatPanelHandle>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatLocked, setChatLocked] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ pose: 'stand', running: false, hold: null, ride: null, hang: null });
  const [help, setHelp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const onChatMinimized = useCallback((min: boolean) => setChatOpen(!min), []);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  };

  // 채팅 접속 기록: 박스에 들어오면 시작하고 30초마다 갱신한다.
  // 오래 끊겼다가 돌아오면 새 접속으로 시작해서, 없던 동안의 대화는 보이지 않는다 (DB가 강제).
  useEffect(() => {
    let alive = true;
    let sid: string | null = null;
    const load = (id: string) =>
      api.get<ChatState>('/chat').then((res) => {
        if (!alive) return;
        sid = id;
        setSessionId(id);
        setMessages(res.messages);
        setSessions(res.sessions);
        setChatLocked(res.locked);
        setMutedUntil(res.mutedUntil);
      });
    const start = () =>
      api.post<{ id: string }>('/chat/session').then(
        (res) => {
          if (alive) load(res.id);
        },
        () => {},
      );
    const ping = () => {
      if (!sid || document.visibilityState !== 'visible') return;
      api.post<{ alive: boolean }>(`/chat/session/${sid}/ping`).then(
        (res) => {
          if (!res.alive) start();
        },
        () => {},
      );
    };
    start();
    const timer = setInterval(ping, 30_000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);

  const chatBlocked = chatLocked && me.profile.role !== 'admin'
    ? '🔒 관리자가 채팅을 잠갔어요'
    : mutedUntil && new Date(mutedUntil) > new Date()
      ? `🚫 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(mutedUntil))}까지 채팅이 제한되어 있어요`
      : null;

  // 실시간으로 받은 메시지 추가 (같은 메시지는 한 번만)
  const addMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((p) => p.id === m.id)) return prev;
      const known = prev.find((p) => p.user_id === m.user_id)?.nickname;
      const next = [...prev, m.nickname === '회원' && known ? { ...m, nickname: known } : m];
      return next.slice(-200);
    });
  }, []);

  const sendChat = async (text: string) => {
    try {
      const { message } = await api.post<{ message: ChatMessage }>('/chat', { body: text });
      spaceRef.current?.showMyBubble(text);
      addMessage(message);
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : '메시지를 보내지 못했어요');
      return false;
    }
  };

  const deleteChat = async (id: string) => {
    try {
      await api.del(`/chat/${id}`);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : '삭제하지 못했어요');
    }
  };

  const checkIn = async () => {
    setChecking(true);
    try {
      const res = await api.post<{ streak: number; alreadyChecked: boolean }>('/me/attendance');
      setMe((prev) => (prev ? { ...prev, checkedInToday: true, streak: res.streak } : prev));
      showToast(res.alreadyChecked ? '오늘은 이미 출석했어요' : `출석 완료! 🔥 ${res.streak}일 연속`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '출석하지 못했어요');
    } finally {
      setChecking(false);
    }
  };

  const open = (target: ObjectKey) => router.push(BOARDS[target].href);

  return (
    <div className="flex h-dvh flex-col bg-[#121214]">
      <header className="z-10 flex items-center gap-2 border-b-2 border-black bg-[var(--burgundy)] px-3 py-2 text-white">
        <Link href="/avatar" className="truncate text-sm font-extrabold" title="캐릭터 꾸미기">
          {me.profile.nickname}
        </Link>
        <span className="chip border-yellow bg-transparent text-yellow">🔥 {me.streak}일</span>
        <div className="flex-1" />
        <BgmControl />
        <Link href="/board" className="btn btn-sm">
          🗂<span className="hidden sm:inline"> 게시판</span>
        </Link>
        <button type="button" className="btn btn-sm btn-primary" disabled={me.checkedInToday || checking} onClick={checkIn}>
          {me.checkedInToday ? '출석 완료' : checking ? '체크 중…' : '출석 체크'}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <BoxSpace
          profile={me.profile}
          onOpen={open}
          onActionState={setAction}
          onChat={addMessage}
          onRequestChat={() => chatInputRef.current?.focus()}
          handleRef={spaceRef}
        />

        {toast && (
          <div className="card absolute left-1/2 top-12 z-30 -translate-x-1/2 px-4 py-2 text-sm font-bold" role="status">
            {toast}
          </div>
        )}

        <ChatPanel
            ref={chatInputRef}
            messages={messages}
            sessions={sessions}
            currentSessionId={sessionId}
            myId={me.profile.id}
            canModerate={me.profile.role === 'admin'}
            blockedReason={chatBlocked}
            onSend={sendChat}
            onDelete={deleteChat}
            onMinimizedChange={onChatMinimized}
          />
        {/* 휴대폰에서 채팅창을 펼치면 겹치지 않게 숨긴다 (채팅창을 접으면 다시 보임) */}
        <div className={`absolute bottom-3 right-3 z-20 items-end gap-2 ${chatOpen ? 'hidden sm:flex' : 'flex'}`}>
          <ActionPad pose={action.pose} running={action.running} hold={action.hold} ride={action.ride} hang={action.hang} onAct={(a) => spaceRef.current?.act(a)} />
          <QuickMenu />
        </div>
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-md bg-black/60 text-white lg:top-12" role="group" aria-label="화면 확대·축소">
          <button type="button" className="h-9 w-9 text-lg font-bold hover:bg-white/10" onClick={() => spaceRef.current?.zoomBy(1)} aria-label="확대">
            ＋
          </button>
          <button type="button" className="h-9 w-9 text-lg font-bold hover:bg-white/10" onClick={() => spaceRef.current?.zoomBy(-1)} aria-label="축소">
            －
          </button>
        </div>
        <div className="absolute right-3 top-3 z-10 hidden flex-col items-end gap-1 lg:flex">
          <button type="button" className="rounded-md bg-black/60 px-2.5 py-1 text-xs text-white" onClick={() => setHelp((v) => !v)} aria-expanded={help}>
            ⌨️ 조작법
          </button>
          {help && (
            <ul className="rounded-md bg-black/75 px-3 py-2 text-xs leading-relaxed text-white">
              <li>방향키 / WASD 이동 · Shift 달리기</li>
              <li>Space 점프 · C 앉기 · Q 춤추기</li>
              <li>E 또는 클릭: 게시판 열기 · 기구 들기/내려놓기 · 머신 타기/내리기</li>
              <li>기구를 들고 Space: 들어올리기 · 철봉에서 Space: 풀업, ←→ 이동</li>
              <li>Enter 채팅</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

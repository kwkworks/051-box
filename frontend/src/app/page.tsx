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
import { useLockPageScroll } from '@/lib/useLockPageScroll';
import type { ChatMessage, ChatState, Me } from '@/lib/types';

export default function HomePage() {
  return <Guard need="member">{(me) => <Space me={me} />}</Guard>;
}

function Space({ me }: { me: Me }) {
  const router = useRouter();
  const { setMe } = useAuth();
  const spaceRef = useRef<BoxSpaceHandle | null>(null);
  useLockPageScroll(); // 아이폰에서 화면 전체가 끌려 움직이지 않게
  const chatInputRef = useRef<ChatPanelHandle>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readAt, setReadAt] = useState<string | null>(null); // 지금까지 읽은 곳 (서버에도 저장)
  const [markerAt, setMarkerAt] = useState<string | null>(null); // 들어올 때 읽었던 곳 ("여기까지 읽었어요")
  const [chatLocked, setChatLocked] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>({ pose: 'stand', running: false });
  const [help, setHelp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const onChatMinimized = useCallback((min: boolean) => setChatOpen(!min), []);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  };

  // 채팅: 오늘 0시부터의 대화 전체. 휴대폰은 화면이 꺼지거나 다른 앱으로 가면 실시간 연결이 멈춰서
  // 그 사이 메시지를 놓치므로, 연결이 돌아올 때 · 화면이 다시 보일 때 · 30초마다 서버에서 다시 받아 맞춘다.
  const refreshChat = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let first = true;
    const load = () =>
      api.get<ChatState>('/chat').then((res) => {
        if (!alive) return;
        setMessages(res.messages);
        setReadAt((prev) => (prev && res.readAt && prev > res.readAt ? prev : res.readAt));
        if (first) {
          first = false;
          setMarkerAt(res.readAt);
        }
        setChatLocked(res.locked);
        setMutedUntil(res.mutedUntil);
      }, () => {});
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    refreshChat.current = refresh;
    load();
    const timer = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      refreshChat.current = () => {};
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  // 맨 아래까지 본 메시지 시각을 "읽음"으로 저장 (휴대폰·PC 같이 기억)
  const markRead = useCallback((at: string) => {
    setReadAt((prev) => (prev && prev >= at ? prev : at));
    api.post('/chat/read', { at }).catch(() => {});
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
      // 내가 보내면 구분선 없이 가장 최신 대화부터
      setMarkerAt(message.created_at);
      markRead(message.created_at);
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
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-[#121214]">
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
          onRealtimeReady={() => refreshChat.current()}
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
            markerAt={markerAt}
            readAt={readAt}
            onRead={markRead}
            myId={me.profile.id}
            canModerate={me.profile.role === 'admin'}
            blockedReason={chatBlocked}
            onSend={sendChat}
            onDelete={deleteChat}
            onMinimizedChange={onChatMinimized}
          />
        {/* 휴대폰에서 채팅창을 펼치면 겹치지 않게 숨긴다 (채팅창을 접으면 다시 보임) */}
        <div className={`absolute bottom-3 right-3 z-20 items-end gap-2 ${chatOpen ? 'hidden sm:flex' : 'flex'}`}>
          <ActionPad pose={action.pose} running={action.running} onAct={(a) => spaceRef.current?.act(a)} />
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
              <li>E 또는 클릭: 게시판 열기 · Enter 채팅</li>
              <li>구조물을 누르면 이름이 보여요</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

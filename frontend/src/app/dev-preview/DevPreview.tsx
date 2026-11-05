'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { ActionPad } from '@/components/ActionPad';
import { AvatarView } from '@/components/AvatarView';
import { ChatPanel } from '@/components/ChatPanel';
import { Podium } from '@/components/Podium';
import { BoxSpace, type BoxSpaceHandle } from '@/game/BoxSpace';
import { AVATAR_OPTIONS, type Avatar } from '@/lib/constants';
import type { ChatMessage, Profile } from '@/lib/types';

const DEMO: Profile = {
  id: '00000000-0000-0000-0000-000000000000',
  nickname: '미리보기',
  role: 'member',
  avatar: { hair: 'ponytail', hairColor: 'brown', topColor: 'yellow', head: 'headband', gear: 'wristwraps' },
};

// 모든 파츠가 한 번씩 나오도록 고르게 섞은 샘플
function samples(): Partial<Avatar>[] {
  const keys = Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[];
  return Array.from({ length: 12 }, (_, i) =>
    Object.fromEntries(keys.map((k, j) => [k, AVATAR_OPTIONS[k][(i * 7 + j * 3) % AVATAR_OPTIONS[k].length]])),
  );
}

export function DevPreview() {
  const [opened, setOpened] = useState("");
  const [view, setView] = useState<'space' | 'avatars' | 'podium'>('space');
  const space = useRef<BoxSpaceHandle | null>(null);
  // 채팅 미리보기: 다른 회원 메시지 8개, 그중 5개는 이미 읽음
  const [msgs, setMsgs] = useState<ChatMessage[]>(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `demo-${i}`, user_id: '11111111-1111-1111-1111-111111111111', nickname: '코치', body: `미리보기 메시지 ${i + 1}`,
      created_at: new Date(Date.UTC(2026, 10, 4, 1, i)).toISOString(), role: i === 0 ? 'admin' : 'member',
    })),
  );
  const demoMarker = new Date(Date.UTC(2026, 10, 4, 1, 4)).toISOString();
  const [demoRead, setDemoRead] = useState<string | null>(demoMarker);
  // 실제 박스 화면처럼 브라우저에서만 채팅창을 그린다 (저장된 위치를 읽기 때문)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex gap-2 p-2">
        <button type="button" className="btn btn-sm" onClick={() => setView('space')}>공간</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('avatars')}>캐릭터</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('podium')}>포디움</button>
      </div>
      {view === 'podium' ? (
        <div className="mx-auto w-full max-w-md p-4">
          <Podium
            myId="u2"
            rows={samples().slice(0, 3).map((a, i) => ({
              user_id: `u${i + 1}`, movement: 'back_squat', is_custom: false, unit: 'lb' as const,
              weight_lb: [315, 285, 275][i], time_sec: null, achieved_on: '2026-11-05',
              nickname: ['김코치', '미리보기', '박회원'][i], gender: 'M' as const, avatar: a,
            }))}
          />
        </div>
      ) : view === 'space' ? (
        <div className="relative min-h-0 flex-1">
          <p id="opened" className="absolute z-10 ml-40 mt-2 rounded bg-white px-2 text-xs">열림: {opened}</p>
          <BoxSpace profile={DEMO} handleRef={space} onOpen={(b) => setOpened(`${b} @ ${new Date().toLocaleTimeString()}`)} />
          {mounted && <ChatPanel
            messages={msgs}
            markerAt={demoMarker}
            readAt={demoRead}
            onRead={setDemoRead}
            myId={DEMO.id}
            canModerate={false}
            blockedReason={null}
            onSend={async (body) => {
              setMsgs((m) => [...m, { id: String(m.length + 1), user_id: DEMO.id, nickname: DEMO.nickname, body, created_at: new Date().toISOString() } as ChatMessage]);
              return true;
            }}
            onDelete={() => {}}
          />}
          <div className="absolute right-3 top-3 z-10 flex flex-col rounded-md bg-black/60 text-white">
            <button type="button" className="h-9 w-9" onClick={() => space.current?.zoomBy(1)}>＋</button>
            <button type="button" className="h-9 w-9" onClick={() => space.current?.zoomBy(-1)}>－</button>
          </div>
          <div className="absolute bottom-3 right-3 z-20">
            <ActionPad pose="stand" running={false} onAct={(a) => space.current?.act(a)} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 overflow-auto bg-[var(--mat)] p-3">
          {samples().map((a, i) => (
            <div key={i} className="flex justify-center gap-1 rounded bg-black/20">
              {(['down', 'right', 'up'] as const).map((d) => (
                <AvatarView key={d} avatar={a} scale={3} dir={d} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

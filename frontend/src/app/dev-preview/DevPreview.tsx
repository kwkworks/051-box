'use client';

import { useState } from 'react';
import { AvatarView } from '@/components/AvatarView';
import { BoxSpace } from '@/game/BoxSpace';
import { AVATAR_OPTIONS, type Avatar } from '@/lib/constants';
import type { Profile } from '@/lib/types';

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
  const [view, setView] = useState<'space' | 'avatars'>('space');
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex gap-2 p-2">
        <button type="button" className="btn btn-sm" onClick={() => setView('space')}>공간</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('avatars')}>캐릭터</button>
      </div>
      {view === 'space' ? (
        <div className="min-h-0 flex-1">
          <p id="opened" className="absolute z-10 ml-40 mt-2 rounded bg-white px-2 text-xs">열림: {opened}</p>
          <BoxSpace profile={DEMO} onOpen={(b) => setOpened(`${b} @ ${new Date().toLocaleTimeString()}`)} />
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

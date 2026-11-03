'use client';

import { useRef } from 'react';
import { BoxSpace } from '@/game/BoxSpace';
import type { Profile } from '@/lib/types';

const DEMO: Profile = {
  id: '00000000-0000-0000-0000-000000000000',
  nickname: '미리보기',
  role: 'member',
  avatar: { hair: 'ponytail', hairColor: 'brown', topColor: 'yellow', acc: 'headband' },
};

export function DevPreview() {
  const chatRef = useRef<((text: string) => void) | null>(null);
  return (
    <div className="h-dvh">
      <BoxSpace profile={DEMO} onOpenBoard={(b) => alert(`열기: ${b}`)} chatRef={chatRef} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { Pose } from '@/game/avatar';
import type { Action } from '@/game/BoxSpace';
import { GEAR, type GearKey } from '@/game/map';

const ACTIONS: { key: Action; icon: string; label: string; keyHint: string }[] = [
  { key: 'jump', icon: '⬆️', label: '점프', keyHint: 'Space' },
  { key: 'sit', icon: '🪑', label: '앉기', keyHint: 'C' },
  { key: 'dance', icon: '💃', label: '춤추기', keyHint: 'Q' },
  { key: 'run', icon: '🏃', label: '달리기', keyHint: 'Shift' },
];

// 액션 버튼: 모바일은 눌러서 고르고, PC는 키보드 단축키도 함께 보여준다
export function ActionPad({
  pose,
  running,
  hold = null,
  ride = null,
  hang = null,
  onAct,
}: {
  pose: Pose;
  running: boolean;
  hold?: GearKey | null;
  ride?: number | null;
  hang?: number | null;
  onAct: (action: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = ride !== null
    ? [{ key: 'ride' as Action, icon: '⬇️', label: '머신에서 내리기', keyHint: 'E' }]
    : hang !== null
      ? [
          { key: 'jump' as Action, icon: '💪', label: '풀업', keyHint: 'Space' },
          { key: 'hang' as Action, icon: '⬇️', label: '내려오기', keyHint: 'E' },
        ]
      : ACTIONS.map((a) => (a.key === 'jump' && hold ? { ...a, icon: '🏋️', label: '들어올리기' } : a));
  if (hold) items.push({ key: 'grab', icon: GEAR[hold].icon, label: `${GEAR[hold].label} 내려놓기`, keyHint: 'E' });
  const active = (a: Action) => (a === 'run' ? running : a === 'grab' ? false : a === pose);

  return (
    <div className="pointer-events-auto relative">
      {open && (
        <div className="card absolute bottom-14 right-0 grid w-48 grid-cols-2 gap-1.5 p-1.5" role="menu" aria-label="액션">
          {items.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={active(a.key)}
              className={`flex flex-col items-center rounded-md border-2 py-2 text-xs font-bold ${active(a.key) ? 'border-ink bg-yellow' : 'border-ink/20 bg-white'}`}
              onClick={() => onAct(a.key)}
            >
              <span className="text-xl" aria-hidden>{a.icon}</span>
              {a.label}
              <span className="hidden text-[10px] font-normal text-muted sm:block">{a.keyHint}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn h-12 px-3" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        🎮 액션
      </button>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { getBgm, loadBgmSettings, saveBgmSettings, type BgmSettings } from '@/lib/bgm';

// 박스 BGM 음량 조절 + 음소거. 설정은 이 기기에만 저장된다.
export function BgmControl() {
  const [settings, setSettings] = useState<BgmSettings>(() =>
    typeof window === 'undefined' ? { volume: 0.4, muted: false } : loadBgmSettings(),
  );
  const [open, setOpen] = useState(false);

  // 첫 클릭이나 키 입력 때 음악 시작 (브라우저 자동재생 정책).
  // 화면을 떠나도 멈추지 않는다: 플레이어는 앱 전체에서 하나를 같이 쓴다.
  // 휴대폰 브라우저는 손가락을 뗄 때(touchend/click)만 소리를 허락하므로 여러 입력에서 시도하고,
  // 실제로 소리가 나기 시작하면 그만 듣는다.
  useEffect(() => {
    const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
    const kick = () => {
      const player = getBgm();
      player.start();
      if (player.running) events.forEach((ev) => window.removeEventListener(ev, kick, true));
    };
    events.forEach((ev) => window.addEventListener(ev, kick, true));
    return () => events.forEach((ev) => window.removeEventListener(ev, kick, true));
  }, []);

  const update = (next: BgmSettings) => {
    setSettings(next);
    saveBgmSettings(next);
    const player = getBgm();
    player.setSettings(next);
    player.start();
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="배경음악 설정"
        title="배경음악"
      >
        {settings.muted || settings.volume === 0 ? '🔇' : '🔊'}
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-30 flex w-56 flex-col gap-2 p-3 text-ink">
          <p className="text-xs font-black">🎵 배경음악</p>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => update({ volume: Number(e.target.value) / 100, muted: false })}
            aria-label="음량"
          />
          <div className="flex items-center justify-between text-xs">
            <span>음량 {Math.round(settings.volume * 100)}%</span>
            <button type="button" className="btn btn-sm" onClick={() => update({ ...settings, muted: !settings.muted })}>
              {settings.muted ? '소리 켜기' : '음소거'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

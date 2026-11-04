'use client';

import { useEffect, useRef, useState } from 'react';
import { Bgm, loadBgmSettings, saveBgmSettings, type BgmSettings } from '@/lib/bgm';

// 박스 BGM 음량 조절 + 음소거. 설정은 이 기기에만 저장된다.
export function BgmControl() {
  const [settings, setSettings] = useState<BgmSettings>(() =>
    typeof window === 'undefined' ? { volume: 0.4, muted: false } : loadBgmSettings(),
  );
  const [open, setOpen] = useState(false);
  const bgm = useRef<Bgm | null>(null);

  // 첫 클릭이나 키 입력 때 음악 시작 (브라우저 자동재생 정책)
  useEffect(() => {
    const player = new Bgm(loadBgmSettings());
    bgm.current = player;
    const kick = () => player.start();
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      player.stop();
      bgm.current = null;
    };
  }, []);

  const update = (next: BgmSettings) => {
    setSettings(next);
    saveBgmSettings(next);
    bgm.current?.setSettings(next);
    bgm.current?.start();
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

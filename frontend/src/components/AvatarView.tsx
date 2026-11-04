'use client';

import { useEffect, useRef } from 'react';
import { drawAvatar, SPRITE_H, SPRITE_W, type Dir } from '@/game/avatar';
import { normalizeAvatar, type Avatar } from '@/lib/constants';

// 캐릭터 한 명을 작은 캔버스에 그린다 (목록, 미리보기용)
export function AvatarView({
  avatar,
  scale = 3,
  dir = 'down',
  animate = false,
  className,
}: {
  avatar?: Partial<Avatar> | null;
  scale?: number;
  dir?: Dir;
  animate?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(normalizeAvatar(avatar));
  const w = Math.round((SPRITE_W + 4) * scale);
  const h = Math.round((SPRITE_H + 4) * scale);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const a = JSON.parse(key) as Avatar;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      drawAvatar(ctx, a, w / 2, h - 1.5 * scale, dir, frame, scale);
    };
    draw();
    if (!animate) return;
    const t = setInterval(() => {
      frame = (frame + 1) % 3;
      draw();
    }, 220);
    return () => clearInterval(t);
  }, [key, scale, dir, animate, w, h]);

  return <canvas ref={ref} width={w} height={h} className={className} style={{ imageRendering: 'pixelated' }} aria-hidden />;
}

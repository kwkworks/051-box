import { COLORS, type Avatar } from '@/lib/constants';

// 캐릭터는 16 x 22 픽셀 격자에 코드로 그린다 (외부 이미지 없음).
// dir: 바라보는 방향, frame: 걷기 동작(0 서 있음, 1·2 걷는 중)
export type Dir = 'down' | 'up' | 'left' | 'right';

type Rect = [x: number, y: number, w: number, h: number, color: string];

export const SPRITE_W = 16;
export const SPRITE_H = 22;

const OUTLINE = '#2A2320';
const EYE = '#2A2320';
const BLUSH = '#F2A0A0';

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function buildRects(a: Avatar, dir: Dir, frame: number): Rect[] {
  const skin = COLORS.skin[a.skin];
  const hair = COLORS.hair[a.hairColor];
  const hairDark = shade(hair, -30);
  const top = COLORS.cloth[a.topColor];
  const topDark = shade(top, -35);
  const bottom = COLORS.cloth[a.bottomColor];
  const shoe = COLORS.cloth[a.shoes];
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  const r: Rect[] = [];

  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  // ---- 뒤쪽 머리카락 (장발, 포니테일)
  if (a.hair === 'long') {
    if (side) r.push([4, 3, 4, 10, hairDark]);
    else r.push([2, 3, 12, back ? 10 : 9, hairDark]);
  }
  if (a.hair === 'ponytail') {
    if (side) r.push([2, 4, 3, 7, hairDark]);
    else if (back) r.push([7, 4, 2, 8, hairDark]);
    else r.push([12, 3, 2, 6, hairDark]);
  }

  // ---- 다리와 신발 (걷기: 다리를 번갈아 올림)
  const legL = side ? 6 : 5;
  const legR = side ? 8 : 9;
  const liftL = step > 0 ? 1 : 0;
  const liftR = step < 0 ? 1 : 0;
  const legColorTop = bottom;
  const shorts = a.bottom === 'shorts';
  for (const [lx, lift, off] of [
    [legL, liftL, side ? -step : 0],
    [legR, liftR, side ? step : 0],
  ] as const) {
    const x = lx + off;
    r.push([x, 17, 2, 3 - lift, shorts ? skin : legColorTop]);
    if (shorts) r.push([x, 17, 2, 1, legColorTop]);
    r.push([x - (side ? 0 : 0), 20 - lift, side ? 3 : 2, 1, shoe]);
  }
  // 바지/반바지 허리
  r.push([side ? 5 : 4, 16, side ? 6 : 8, 2, bottom]);

  // ---- 몸통
  const bodyX = side ? 5 : 4;
  const bodyW = side ? 6 : 8;
  if (a.top === 'tank') {
    r.push([bodyX + 1, 11, bodyW - 2, 6, top]);
    r.push([bodyX, 12, bodyW, 5, top]);
  } else {
    r.push([bodyX, 11, bodyW, 6, top]);
  }
  if (a.top === 'hoodie') {
    r.push([bodyX + 1, 11, bodyW - 2, 1, topDark]);
    if (!side && !back) r.push([6, 14, 4, 2, topDark]);
  }
  if (!side && !back && a.top === 'tshirt') r.push([7, 11, 2, 1, skin]);

  // ---- 팔
  const sleeve = a.top === 'tank' ? skin : top;
  const longSleeve = a.top === 'hoodie';
  const swing = step;
  if (side) {
    const ax = 7 + (dir === 'right' ? swing : -swing);
    r.push([ax, 12, 2, longSleeve ? 4 : 2, sleeve]);
    if (!longSleeve) r.push([ax, 14, 2, 2, skin]);
    r.push([ax, 16, 2, 1, skin]);
  } else {
    for (const [ax, sw] of [
      [2, swing],
      [12, -swing],
    ] as const) {
      r.push([ax, 11 + Math.max(0, sw), 2, longSleeve ? 4 : 2, sleeve]);
      if (!longSleeve) r.push([ax, 13 + Math.max(0, sw), 2, 2, skin]);
      r.push([ax, 15 + Math.max(0, sw), 2, 1, skin]);
    }
    if (a.acc === 'wristband') {
      r.push([2, 14 + Math.max(0, swing), 2, 1, COLORS.cloth.yellow]);
      r.push([12, 14 + Math.max(0, -swing), 2, 1, COLORS.cloth.yellow]);
    }
  }

  // ---- 머리
  const headX = side ? 4 : 3;
  const headW = side ? 8 : 10;
  r.push([headX, 2, headW, 9, skin]);

  // 얼굴
  if (!back) {
    if (side) {
      const ex = dir === 'right' ? 9 : 6;
      r.push([ex, 6, 1, 2, EYE]);
      r.push([dir === 'right' ? 8 : 7, 8, 1, 1, BLUSH]);
    } else {
      r.push([5, 6, 1, 2, EYE], [10, 6, 1, 2, EYE], [4, 8, 1, 1, BLUSH], [11, 8, 1, 1, BLUSH]);
    }
  }

  // ---- 앞머리 / 윗머리
  if (back) {
    r.push([3, 1, 10, 8, hair]);
    if (a.hair === 'buzz') r.splice(r.length - 1, 1, [3, 1, 10, 4, hair]);
  } else {
    switch (a.hair) {
      case 'buzz':
        r.push([headX, 1, headW, 2, hair]);
        break;
      case 'curly':
        r.push([headX - 1, 0, headW + 2, 4, hair]);
        r.push([headX, 4, 2, 2, hair], [headX + headW - 2, 4, 2, 2, hair]);
        r.push([headX + 1, -1, 2, 1, hair], [headX + 5, -1, 2, 1, hair]);
        break;
      case 'long':
        r.push([headX, 1, headW, 3, hair]);
        r.push([headX, 4, 1, side ? 3 : 6, hair], [headX + headW - 1, 4, 1, side ? 3 : 6, hair]);
        break;
      default:
        r.push([headX, 1, headW, 3, hair]);
        if (side) r.push([dir === 'right' ? headX : headX + headW - 3, 4, 3, 3, hair]);
        else r.push([headX, 4, 2, 1, hair], [headX + headW - 2, 4, 2, 1, hair], [headX + 3, 4, 3, 1, hair]);
    }
    if (a.hair === 'bun') r.push([6, -1, 4, 2, hair]);
  }
  if (back && a.hair === 'bun') r.push([6, -1, 4, 2, hair]);

  // ---- 액세서리
  if (a.acc === 'headband') r.push([headX, 4, headW, 1, COLORS.cloth.red]);
  if (a.acc === 'cap') {
    r.push([headX - 1, 0, headW + 2, 3, COLORS.cloth.burgundy]);
    if (side) r.push([dir === 'right' ? headX + headW - 1 : headX - 3, 3, 4, 1, shade(COLORS.cloth.burgundy, -30)]);
    else if (!back) r.push([headX, 3, headW, 1, shade(COLORS.cloth.burgundy, -30)]);
  }
  if (a.acc === 'glasses' && !back) {
    if (side) r.push([dir === 'right' ? 8 : 5, 6, 3, 1, EYE]);
    else r.push([4, 6, 3, 1, EYE], [9, 6, 3, 1, EYE], [7, 6, 2, 1, EYE]);
  }

  return r;
}

// (x, y) = 발밑 중앙 위치. scale = 화면에서 픽셀 하나의 크기
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: Avatar,
  x: number,
  y: number,
  dir: Dir,
  frame: number,
  scale: number,
) {
  // 왼쪽은 오른쪽 모습을 좌우 반전해서 그린다
  const rects = buildRects(avatar, dir === 'left' ? 'right' : dir, frame);
  const ox = Math.round(x - (SPRITE_W / 2) * scale);
  const oy = Math.round(y - SPRITE_H * scale);
  const mirror = dir === 'left';
  const place = (rx: number, rw: number) => (mirror ? SPRITE_W - rx - rw : rx);

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y - scale * 0.5, 5 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // 1) 외곽선: 모든 조각을 1픽셀 크게 어둡게 칠한다
  ctx.fillStyle = OUTLINE;
  for (const [rx, ry, rw, rh] of rects) {
    ctx.fillRect(ox + (place(rx, rw) - 1) * scale, oy + (ry - 1) * scale, (rw + 2) * scale, (rh + 2) * scale);
  }
  // 2) 실제 색
  for (const [rx, ry, rw, rh, color] of rects) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + place(rx, rw) * scale, oy + ry * scale, rw * scale, rh * scale);
  }
}

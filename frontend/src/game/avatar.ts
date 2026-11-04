import { COLORS, type Avatar } from '@/lib/constants';

// 캐릭터는 24 x 32 픽셀 격자에 코드로 그린다 (외부 이미지 없음).
// 한 번 그린 모습은 캐시에 저장해두고 다시 쓴다.
export type Dir = 'down' | 'up' | 'left' | 'right';
export type Pose = 'stand' | 'sit' | 'dance';
// 그릴 때만 쓰는 자세 (점프 중 공중 동작). 네트워크로 주고받지 않는다
export type DrawPose = Pose | 'air';

type Rect = [x: number, y: number, w: number, h: number, color: string];

export const SPRITE_W = 24;
export const SPRITE_H = 32;

const OUTLINE = [42, 35, 32];
const DARK = '#2A2320';
const WHITE = '#FFFFFF';
const BLUSH = '#F2A0A0';

const HEAD_GEAR: Record<string, string> = { headband: '#D9443E', cap: '#7A2E3A', beanie: '#2B2B30', backcap: '#1F1F22' };

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `#${((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
}

// 오른쪽(right) / 정면(down) / 뒷모습(up)만 그린다. 왼쪽은 오른쪽을 좌우 반전한다.
function buildRects(a: Avatar, dir: 'down' | 'up' | 'right', frame: number, pose: DrawPose): Rect[] {
  const skin = COLORS.skin[a.skin];
  const skinDark = shade(skin, -28);
  const hair = COLORS.hair[a.hairColor];
  const hairDark = shade(hair, -32);
  const hairLight = shade(hair, 28);
  const top = COLORS.cloth[a.topColor];
  const topDark = shade(top, -34);
  const topLight = shade(top, 30);
  const bottom = COLORS.cloth[a.bottomColor];
  const bottomDark = shade(bottom, -30);
  const shoe = COLORS.cloth[a.shoes];
  const side = dir === 'right';
  const back = dir === 'up';
  const front = dir === 'down';
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const r: Rect[] = [];
  const add = (...rects: Rect[]) => r.push(...rects);

  // ---------------- 뒤쪽 머리카락 (몸보다 먼저)
  if (a.hair === 'long') add(side ? [6, 5, 4, 14, hairDark] : [5, 5, 14, back ? 13 : 13, hairDark]);
  if (a.hair === 'bob') add(side ? [6, 5, 4, 9, hairDark] : [5, 5, 14, 9, hairDark]);
  if (a.hair === 'ponytail') add(side ? [3, 6, 4, 9, hairDark] : back ? [10, 12, 4, 9, hairDark] : [18, 6, 2, 8, hairDark]);
  if (a.hair === 'twintail') {
    if (side) add([5, 8, 3, 11, hairDark]);
    else add([2, 8, 3, 11, hairDark], [19, 8, 3, 11, hairDark]);
  }

  // ---------------- 다리 + 신발 (걷기: 번갈아 들기)
  const shorts = a.bottom === 'shorts';
  const legTop = 25;
  const legs: [number, number][] = side ? [[9, -step], [12, step]] : [[7, 0], [13, 0]];
  legs.forEach(([lx, off], i) => {
    const lift = !side && ((i === 0 && step > 0) || (i === 1 && step < 0)) ? 1 : 0;
    const x = lx + off;
    const w = side ? 3 : 4;
    const legH = 5 - lift;
    if (shorts) add([x, legTop, w, 2, bottom], [x, legTop + 2, w, legH - 2, skin]);
    else add([x, legTop, w, legH, bottom]);
    if (a.bottom === 'leggings') add([x + (side ? 1 : w - 1), legTop, 1, legH, bottomDark]);
    if (a.bottom === 'joggers') add([x, legTop + legH - 1, w, 1, bottomDark]);
    if (a.gear === 'kneesleeves') add([x, legTop + 2, w, 1, '#1F1F22']);
    const sx = side ? x : x - (i === 0 ? 1 : 0);
    add([sx, 30 - lift, side ? 4 : 5, 2, shoe], [sx, 31 - lift, side ? 4 : 5, 1, shade(shoe, -40)]);
  });

  // ---------------- 엉덩이(하의 윗부분)
  add(side ? [8, 23, 8, 2, bottom] : [6, 23, 12, 2, bottom]);

  // ---------------- 몸통
  const tx = side ? 8 : 6;
  const tw = side ? 8 : 12;
  const crop = a.top === 'crop';
  const sleeveless = a.top === 'tank' || a.top === 'jersey';
  if (sleeveless) {
    add([tx + 1, 16, tw - 2, 7, top], [tx, 17, tw, 6, top]);
    if (front) add([9, 16, 6, 1, skin]);
  } else {
    add([tx, 16, tw, crop ? 5 : 7, top]);
    if (crop) add([tx, 21, tw, 2, skin], [tx + 2, 22, tw - 4, 1, skinDark]);
  }
  if (a.top === 'hoodie') {
    add(back ? [tx + 1, 13, tw - 2, 3, topDark] : [tx + 2, 16, tw - 4, 1, topDark]);
    if (front) add([9, 19, 6, 3, topDark], [11, 17, 1, 2, topLight], [13, 17, 1, 2, topLight]);
  }
  if (a.top === 'jersey') add(front ? [tx + 1, 16, tw - 2, 1, topLight] : [tx, 16, tw, 1, topLight]);
  if (a.topPrint === 'stripe' && !crop) add([tx, 19, tw, 1, topLight], [tx, 21, tw, 1, topLight]);
  if (a.topPrint === 'logo' && front) add([10, 18, 4, 3, '#E8B923'], [11, 19, 2, 1, DARK]);
  if (a.top === 'jersey' && back) add([10, 18, 4, 3, WHITE]);
  // 목
  if (!sleeveless) add(side ? [12, 15, 3, 1, skin] : [10, 15, 4, 1, skin]);
  else add(side ? [12, 15, 3, 1, skin] : [10, 15, 4, 1, skin]);

  // ---------------- 팔
  const sleeveLen = sleeveless ? 0 : a.top === 'hoodie' || a.top === 'longsleeve' ? 6 : 2;
  const armRects = (ax: number, ay: number, w: number) => {
    if (sleeveLen) add([ax, ay, w, sleeveLen, top]);
    if (sleeveLen < 6) add([ax, ay + sleeveLen, w, 6 - sleeveLen, skin]);
    add([ax, ay + 6, w, 2, skin]);
    if (a.gear === 'wristwraps') add([ax, ay + 5, w, 1, '#F4F2EE'], [ax, ay + 5, 1, 1, '#D9443E']);
  };
  // 춤: 팔을 번갈아 머리 위로
  const raisedArm = (ax: number, w: number) => {
    add([ax, 13, w, 3, sleeveLen ? top : skin], [ax, 10, w, 3, skin], [ax, 8, w, 2, skin]);
  };
  if (pose === 'air' && !side) {
    // 공중: 두 팔을 번쩍
    raisedArm(3, 3);
    raisedArm(18, 3);
  } else if (pose === 'dance' && !side) {
    if (frame !== 2) raisedArm(3, 3);
    else armRects(3, 16, 3);
    if (frame !== 1) raisedArm(18, 3);
    else armRects(18, 16, 3);
  } else if (side) {
    if (pose === 'dance' || pose === 'air') raisedArm(11, 3);
    else armRects(11 + step, 16, 3);
  } else {
    armRects(3, 16 + Math.max(0, step), 3);
    armRects(18, 16 + Math.max(0, -step), 3);
  }

  // ---------------- 벨트
  if (a.gear === 'belt') {
    add(side ? [8, 22, 8, 2, '#6B4428'] : [6, 22, 12, 2, '#6B4428']);
    if (front) add([11, 22, 2, 2, '#C9C9C9']);
  }

  // ---------------- 머리
  if (side) add([8, 4, 9, 11, skin], [7, 5, 11, 9, skin], [17, 10, 1, 2, skin]);
  else add([7, 4, 10, 12, skin], [6, 5, 12, 10, skin]);
  if (front) add([5, 9, 1, 3, skin], [18, 9, 1, 3, skin]);
  if (side) add([10, 9, 2, 3, skinDark]);

  // ---------------- 얼굴
  if (!back) {
    const ex = side ? [14] : [8, 14];
    for (const x of ex) {
      switch (a.eyes) {
        case 'smile':
          add([x, 10, 1, 1, DARK], [x + 1, 9, 1, 1, DARK], [x + 2, 10, 1, 1, DARK]);
          break;
        case 'sharp':
          add([x, 10, 3, 1, DARK], [x === 8 || side ? x : x + 2, 9, 1, 1, DARK]);
          break;
        case 'sleepy':
          add([x, 10, 3, 1, DARK]);
          break;
        case 'sparkle':
          add([x, 9, 2, 2, DARK], [x, 9, 1, 1, WHITE], [x + 1, 10, 1, 1, '#7FB6F0']);
          break;
        default:
          add([x, 9, 2, 2, DARK], [x, 9, 1, 1, WHITE]);
      }
      switch (a.brows) {
        case 'thick':
          add([x, 7, 3, 1, hairDark], [x, 6, 2, 1, hairDark]);
          break;
        case 'angry':
          add(x === 8 ? [x, 6, 1, 1, hairDark] : [x + 2, 6, 1, 1, hairDark], [x === 8 ? x + 1 : x, 7, 2, 1, hairDark]);
          break;
        case 'none':
          break;
        default:
          add([x, 7, 2, 1, hairDark]);
      }
    }
    add(side ? [14, 12, 2, 1, BLUSH] : [7, 12, 2, 1, BLUSH]);
    if (front) add([15, 12, 2, 1, BLUSH]);

    // 수염 (입보다 먼저)
    const mx = side ? 14 : 10;
    if (a.facial === 'beard') add(side ? [11, 12, 6, 3, hair] : [7, 12, 10, 3, hair], side ? [12, 15, 4, 1, hairDark] : [8, 15, 8, 1, hairDark]);
    if (a.facial === 'mustache') add([mx, 12, side ? 3 : 4, 1, hair]);
    if (a.facial === 'stubble') {
      const dots: [number, number][] = side ? [[13, 13], [15, 14], [14, 15], [16, 13]] : [[8, 13], [10, 14], [13, 14], [15, 13], [9, 15], [14, 15]];
      for (const [x, y] of dots) add([x, y, 1, 1, skinDark]);
    }

    switch (a.mouth) {
      case 'grin':
        add(side ? [14, 13, 3, 2, DARK] : [10, 13, 4, 2, DARK], side ? [14, 13, 2, 1, WHITE] : [11, 13, 2, 1, WHITE]);
        break;
      case 'neutral':
        add(side ? [15, 13, 2, 1, DARK] : [11, 13, 2, 1, DARK]);
        break;
      case 'open':
        add(side ? [15, 13, 2, 2, DARK] : [11, 13, 2, 2, DARK], side ? [15, 14, 2, 1, '#C2453A'] : [11, 14, 2, 1, '#C2453A']);
        break;
      default:
        add(side ? [14, 13, 1, 1, DARK] : [10, 13, 1, 1, DARK], side ? [15, 14, 2, 1, DARK] : [11, 14, 2, 1, DARK]);
        if (front) add([13, 13, 1, 1, DARK]);
    }
  }

  // ---------------- 머리카락 (앞)
  const hx = side ? 7 : 6;
  const hw = side ? 11 : 12;
  const cap: Rect[] = [[hx, 2, hw, 4, hair], [hx + 1, 1, hw - 2, 1, hair], [hx + 2, 2, 3, 1, hairLight]];
  if (back && a.hair !== 'buzz' && a.hair !== 'bald' && a.hair !== 'mohawk') {
    add([6, 2, 12, 12, hair], [7, 1, 10, 1, hair], [8, 3, 3, 1, hairLight]);
  } else {
    switch (a.hair) {
      case 'buzz':
        add([hx + 1, 3, hw - 2, 2, hair], [hx, 4, 1, 2, hair], [hx + hw - 1, 4, 1, 2, hair]);
        break;
      case 'bald':
        add([hx + 3, 4, 2, 1, shade(skin, 22)]);
        break;
      case 'mohawk':
        add([side ? 10 : 10, 0, 4, 6, hair], [side ? 11 : 11, 0, 2, 1, hairLight], [hx, 4, hw, 1, shade(skin, -14)]);
        break;
      case 'curly':
        add([hx - 1, 1, hw + 2, 6, hair], [hx - 2, 3, 1, 4, hair], [hx + hw + 1, 3, 1, 4, hair]);
        for (let x = hx; x < hx + hw; x += 3) add([x, 6, 2, 1, hairDark], [x + 1, 2, 1, 1, hairLight]);
        break;
      case 'sidepart':
        add(...cap, side ? [13, 6, 5, 2, hair] : [6, 6, 8, 2, hair], side ? [7, 6, 3, 4, hair] : [16, 6, 2, 3, hair]);
        if (front) add([13, 3, 1, 3, hairDark]);
        break;
      case 'bob':
        add(...cap, side ? [13, 6, 5, 2, hair] : [6, 6, 12, 2, hair], side ? [6, 5, 4, 9, hair] : [5, 6, 2, 8, hair]);
        if (front) add([17, 6, 2, 8, hair]);
        break;
      case 'long':
        add(...cap, side ? [13, 6, 4, 1, hair] : [8, 6, 8, 1, hair], side ? [6, 5, 4, 13, hair] : [5, 6, 2, 12, hair]);
        if (front) add([17, 6, 2, 12, hair]);
        break;
      case 'twintail':
        add(...cap, side ? [13, 6, 4, 1, hair] : [7, 6, 10, 1, hair]);
        if (front) add([4, 7, 2, 2, '#D9443E'], [18, 7, 2, 2, '#D9443E']);
        break;
      case 'bun':
        add(...cap, side ? [7, 0, 4, 3, hair] : [9, 0, 6, 3, hair], side ? [13, 6, 4, 1, hair] : [7, 6, 3, 1, hair]);
        if (front) add([14, 6, 3, 1, hair]);
        break;
      default: // short, ponytail
        add(...cap, side ? [13, 6, 5, 2, hair] : [9, 6, 6, 1, hair], side ? [7, 6, 3, 3, hair] : [6, 6, 2, 3, hair]);
        if (front) add([16, 6, 2, 3, hair]);
        if (a.hair === 'ponytail' && front) add([17, 4, 2, 2, '#D9443E']);
    }
  }

  // ---------------- 모자·밴드
  const hg = HEAD_GEAR[a.head];
  if (a.head === 'headband') add([hx, 6, hw, 1, hg]);
  if (a.head === 'cap' || a.head === 'backcap') {
    add([hx - 1, 1, hw + 2, 4, hg], [hx, 0, hw, 1, hg]);
    const brim = shade(hg, a.head === 'cap' ? -30 : 40);
    const brimFront = a.head === 'cap' ? !back : back;
    if (side) add(a.head === 'cap' ? [15, 4, 5, 1, brim] : [4, 4, 4, 1, brim]);
    else if (brimFront) add([hx, 5, hw, 1, brim]);
    if (front && a.head === 'cap') add([11, 2, 2, 2, '#E8B923']);
  }
  if (a.head === 'beanie') add([hx - 1, 0, hw + 2, 6, hg], [hx - 1, 5, hw + 2, 1, shade(hg, 40)], [hx + 4, 0, 3, 1, '#D9443E']);

  // ---------------- 안경
  if (a.face !== 'none' && !back) {
    const lenses = side ? [13] : [7, 13];
    for (const x of lenses) {
      if (a.face === 'sunglasses') add([x, 8, 4, 3, '#121214'], [x + 1, 9, 1, 1, '#6B6B75']);
      else add([x, 8, 4, 1, DARK], [x, 11, 4, 1, DARK], [x, 8, 1, 4, DARK], [x + 3, 8, 1, 4, DARK]);
    }
    if (front) add([11, 9, 2, 1, DARK]);
    else add([10, 9, 3, 1, DARK]);
  }

  // ---------------- 헤드폰
  if (a.gear === 'headphones') {
    add(side ? [9, 0, 6, 1, '#2B2B30'] : [6, 0, 12, 1, '#2B2B30']);
    if (side) add([9, 7, 3, 5, '#2B2B30'], [10, 8, 1, 3, '#D9443E']);
    else add([4, 6, 2, 6, '#2B2B30'], [18, 6, 2, 6, '#2B2B30'], [5, 7, 1, 4, '#D9443E'], [18, 7, 1, 4, '#D9443E']);
  }

  if (pose === 'sit') {
    const bottom = COLORS.cloth[a.bottomColor];
    const shoe = COLORS.cloth[a.shoes];
    const upper = r.filter(([, y]) => y < 25).map(([x, y, w, h, c]) => [x, y + 3, w, h, c] as Rect);
    const legs: Rect[] = side
      ? [[9, 28, 7, 2, a.bottom === 'shorts' ? COLORS.skin[a.skin] : bottom], [9, 28, 3, 2, bottom], [15, 27, 3, 3, shoe]]
      : [[7, 28, 4, 2, bottom], [13, 28, 4, 2, bottom], [6, 30, 5, 2, shoe], [13, 30, 5, 2, shoe]];
    return [...upper.filter(([, y]) => y < 28), ...legs];
  }
  return r;
}

// ---------------- 렌더링 (외곽선 포함 스프라이트를 캐시)
const cache = new Map<string, HTMLCanvasElement>();
const PAD = 1;

function renderSprite(a: Avatar, dir: Dir, frame: number, pose: DrawPose): HTMLCanvasElement {
  const key = `${JSON.stringify(a)}|${dir}|${frame}|${pose}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const w = SPRITE_W + PAD * 2;
  const h = SPRITE_H + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const mirror = dir === 'left';
  for (const [x, y, rw, rh, color] of buildRects(a, dir === 'left' ? 'right' : dir, frame, pose)) {
    ctx.fillStyle = color;
    ctx.fillRect((mirror ? SPRITE_W - x - rw : x) + PAD, y + PAD, rw, rh);
  }
  // 외곽선: 비어 있는 픽셀 중 그림과 맞닿은 곳을 어둡게 칠한다
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const edges: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) {
        edges.push((y * w + x) * 4);
      }
    }
  }
  for (const i of edges) {
    d[i] = OUTLINE[0];
    d[i + 1] = OUTLINE[1];
    d[i + 2] = OUTLINE[2];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  if (cache.size > 600) cache.clear();
  cache.set(key, canvas);
  return canvas;
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
  pose: DrawPose = 'stand',
  lift = 0, // 점프 높이 (그림자는 바닥에 남는다)
  squash = 1, // 세로 비율: 1보다 작으면 웅크림(가로는 그만큼 넓게), 크면 늘어남
) {
  // 높이 뜰수록 그림자가 작고 옅어진다
  const far = Math.min(1, lift / 30);
  ctx.fillStyle = `rgba(0,0,0,${0.28 - far * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(x, y - scale, 7 * scale * (1 - far * 0.35), 2 * scale * (1 - far * 0.35), 0, 0, Math.PI * 2);
  ctx.fill();

  const sprite = renderSprite(avatar, dir, frame, pose);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sprite,
    Math.round(x - (sprite.width / 2) * scale * (2 - squash)),
    Math.round(y - lift - (SPRITE_H + PAD) * scale * squash),
    sprite.width * scale * (2 - squash),
    sprite.height * scale * squash,
  );
  ctx.imageSmoothingEnabled = prev;
}

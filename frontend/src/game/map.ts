// 크로스핏051 박스를 탑뷰 픽셀 맵으로 옮긴다. 모든 그림은 코드로 그린다.
export const TILE = 32;
export const COLS = 40;
export const ROWS = 26;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const SPAWN = { x: 36.5 * TILE, y: 23.5 * TILE };

export type BoardKey = 'wod' | 'notices' | 'competition' | 'gathering' | 'one-rm' | 'wall';

export const BOARDS: Record<BoardKey, { label: string; href: string; hint: string }> = {
  wod: { label: 'RECORD 화이트보드', href: '/wod', hint: '오늘 WOD와 기록 사진' },
  notices: { label: '데스크', href: '/notices', hint: '공지사항' },
  competition: { label: '대회 포스터', href: '/events?kind=competition', hint: '대회와 이벤트 신청' },
  gathering: { label: '팀 배너 벽', href: '/events?kind=gathering', hint: '회원 모임' },
  'one-rm': { label: '바벨 랙', href: '/one-rm', hint: '1RM 기록과 순위' },
  wall: { label: '명예의 벽', href: '/wall', hint: 'PR 축하 피드' },
};

type Box = { x: number; y: number; w: number; h: number };

// 상호작용 오브젝트: 타일 좌표
export const OBJECTS: (Box & { board: BoardKey })[] = [
  { board: 'wall', x: 2, y: 0, w: 6, h: 3 },
  { board: 'gathering', x: 9, y: 0, w: 7, h: 3 },
  { board: 'wod', x: 19, y: 3, w: 7, h: 2 },
  { board: 'competition', x: 29, y: 0, w: 5, h: 3 },
  { board: 'one-rm', x: 1, y: 13, w: 3, h: 7 },
  { board: 'notices', x: 29, y: 19, w: 7, h: 3 },
];

// 장애물 (상호작용 없음)
const RIG_POSTS: [number, number][] = [];
for (const row of [8, 14]) for (let x = 5; x <= 21; x += 4) RIG_POSTS.push([x, row]);
const BIKES: Box[] = [30, 32, 34, 36].map((x) => ({ x, y: 6, w: 1, h: 2 }));
const PILLARS: Box[] = [
  { x: 26, y: 10, w: 2, h: 2 },
  { x: 26, y: 16, w: 2, h: 2 },
];
const BOXES: Box[] = [{ x: 22, y: 10, w: 2, h: 1 }];
const COOLER: Box = { x: 37, y: 19, w: 1, h: 2 };

export const solid: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
function block(b: Box) {
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (solid[y]) solid[y][x] = true;
}
for (let x = 0; x < COLS; x++) {
  block({ x, y: 0, w: 1, h: 3 });
  if (x < 35 || x > 37) block({ x, y: ROWS - 1, w: 1, h: 1 });
}
for (let y = 0; y < ROWS; y++) {
  block({ x: 0, y, w: 1, h: 1 });
  block({ x: COLS - 1, y, w: 1, h: 1 });
}
OBJECTS.forEach(block);
RIG_POSTS.forEach(([x, y]) => block({ x, y, w: 1, h: 1 }));
[...BIKES, ...PILLARS, ...BOXES, COOLER].forEach(block);

export function isSolidAt(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return solid[ty][tx];
}

// 캐릭터 발밑(가로 14px, 세로 8px)이 막힌 칸에 닿는지
export function collides(x: number, y: number): boolean {
  return (
    isSolidAt(x - 7, y - 8) || isSolidAt(x + 7, y - 8) || isSolidAt(x - 7, y - 1) || isSolidAt(x + 7, y - 1)
  );
}

// 오브젝트 주변 1칸 안에 있으면 상호작용 가능
export function nearbyBoard(x: number, y: number): BoardKey | null {
  const tx = x / TILE;
  const ty = (y - 4) / TILE;
  let best: BoardKey | null = null;
  let bestDist = Infinity;
  for (const o of OBJECTS) {
    const dx = Math.max(o.x - tx, 0, tx - (o.x + o.w));
    const dy = Math.max(o.y - ty, 0, ty - (o.y + o.h));
    const d = Math.hypot(dx, dy);
    if (d < 1.1 && d < bestDist) {
      best = o.board;
      bestDist = d;
    }
  }
  return best;
}

// 탭한 곳까지 타일 단위로 길 찾기 (BFS)
export function findPath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
  const sx = Math.floor(fromX / TILE);
  const sy = Math.floor((fromY - 4) / TILE);
  let gx = Math.floor(toX / TILE);
  let gy = Math.floor(toY / TILE);
  gx = Math.max(0, Math.min(COLS - 1, gx));
  gy = Math.max(0, Math.min(ROWS - 1, gy));
  // 막힌 곳을 누르면 가장 가까운 빈 칸으로
  if (solid[gy][gx]) {
    let found = false;
    for (let r = 1; r < 4 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !solid[ny][nx]) {
            gx = nx;
            gy = ny;
            found = true;
          }
        }
      }
    }
    if (!found) return [];
  }
  const key = (x: number, y: number) => y * COLS + x;
  const prev = new Map<number, number>();
  const queue: [number, number][] = [[sx, sy]];
  prev.set(key(sx, sy), -1);
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    if (cx === gx && cy === gy) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || solid[ny][nx] || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(cx, cy));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(gx, gy))) return [];
  const center = (x: number, y: number) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE + 6 });
  const path: { x: number; y: number }[] = [];
  let cur = key(gx, gy);
  while (cur !== -1 && cur !== key(sx, sy)) {
    path.unshift(center(cur % COLS, Math.floor(cur / COLS)));
    cur = prev.get(cur)!;
  }
  // 먼저 지금 있는 칸의 가운데로 가야 모서리에 걸리지 않는다
  if (path.length) path.unshift(center(sx, sy));
  return path;
}

// ------------------------------------------------------------------
// 고정된 배경을 한 번만 그려둔다
// ------------------------------------------------------------------
const C = {
  wall: '#F3F0EA',
  wallShade: '#E2DDD3',
  burgundy: '#7A2E3A',
  yellow: '#E8B923',
  mat: '#26262A',
  matLine: '#323237',
  walk: '#3A3A3F',
  speck: '#55555C',
  black: '#17171A',
  white: '#FFFFFF',
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export function drawStaticMap(ctx: CanvasRenderingContext2D) {
  const T = TILE;
  // 바닥: 운동 공간은 검은 매트, 통로는 점박이 바닥
  rect(ctx, 0, 0, WORLD_W, WORLD_H, C.mat);
  for (let y = 3; y < ROWS; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const walk = x >= 25;
      rect(ctx, x * T, y * T, T, T, walk ? C.walk : C.mat);
      ctx.strokeStyle = walk ? '#333338' : C.matLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
      if (walk) {
        for (let i = 0; i < 4; i++) {
          const sx = (x * 37 + y * 17 + i * 11) % 28;
          const sy = (x * 13 + y * 29 + i * 7) % 28;
          rect(ctx, x * T + 2 + sx, y * T + 2 + sy, 2, 2, C.speck);
        }
      }
    }
  }
  // 바닥 라인 (WOD 구역 표시)
  rect(ctx, 5 * T, 21 * T, 17 * T, 2, '#BDBDBD');

  // 벽 (위, 좌우, 아래)
  rect(ctx, 0, 0, WORLD_W, 3 * T, C.wall);
  rect(ctx, 0, 3 * T - 6, WORLD_W, 6, C.wallShade);
  rect(ctx, 0, 1.55 * T, WORLD_W, 8, C.burgundy);
  rect(ctx, 0, 1.55 * T + 8, WORLD_W, 5, C.yellow);
  rect(ctx, 0, 3 * T, T, WORLD_H, C.wallShade);
  rect(ctx, WORLD_W - T, 3 * T, T, WORLD_H, C.wallShade);
  rect(ctx, 0, WORLD_H - T, 35 * T, T, C.wallShade);
  rect(ctx, 38 * T, WORLD_H - T, 2 * T, T, C.wallShade);
  // 입구
  rect(ctx, 35 * T, WORLD_H - T, 3 * T, T, '#5C5C63');
  label(ctx, '입구', 36.5 * T, WORLD_H - T / 2, '#E8E8E8', 12);

  // 051 로고 벽화 (왼쪽 벽 위쪽)
  label(ctx, '051', 17.5 * T, 1 * T, '#C9C2B5', 26);

  // 명예의 벽: 상장 액자와 메달
  for (let i = 0; i < 5; i++) {
    rect(ctx, 2.2 * T + i * 36, 0.25 * T, 28, 34, '#D8CFAE');
    rect(ctx, 2.2 * T + i * 36 + 3, 0.25 * T + 3, 22, 28, '#FFFDF5');
    rect(ctx, 2.2 * T + i * 36 + 7, 0.25 * T + 10, 14, 2, '#B9AE8C');
    rect(ctx, 2.2 * T + i * 36 + 7, 0.25 * T + 16, 14, 2, '#B9AE8C');
  }
  for (let i = 0; i < 4; i++) {
    rect(ctx, 2.6 * T + i * 44, 2.05 * T, 3, 10, ['#D9443E', '#3B82C4', '#E8B923', '#3E9E5F'][i]);
    ctx.fillStyle = i % 2 ? '#C9C9C9' : '#E5B53A';
    ctx.beginPath();
    ctx.arc(2.6 * T + i * 44 + 1.5, 2.05 * T + 14, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 팀 배너 벽: 버건디 팀 이름판
  const banners = ['TEAM A', 'TEAM B', 'TEAM C', 'TEAM D', 'TEAM E', 'TEAM F'];
  banners.forEach((b, i) => {
    const bx = 9.3 * T + (i % 3) * 72;
    const by = 0.2 * T + Math.floor(i / 3) * 26;
    rect(ctx, bx, by, 64, 22, C.burgundy);
    rect(ctx, bx + 2, by + 2, 60, 18, '#8A3A47');
    label(ctx, b, bx + 32, by + 11, '#F6E7C1', 10);
  });

  // 대회 포스터
  rect(ctx, 29.3 * T, 0.2 * T, 4.4 * T, 2.5 * T, '#2F6FD1');
  rect(ctx, 29.3 * T + 4, 0.2 * T + 4, 4.4 * T - 8, 2.5 * T - 8, '#3E82E6');
  label(ctx, '멋지다 051', 31.5 * T, 0.8 * T, C.white, 13);
  label(ctx, 'COMPETITION', 31.5 * T, 1.55 * T, '#FFE27A', 11);
  rect(ctx, 30.6 * T, 1.95 * T, 1.8 * T, 6, C.yellow);

  // RECORD 화이트보드 (스탠드형)
  rect(ctx, 19 * T, 3 * T, 7 * T, 2 * T - 6, '#9A9A9A');
  rect(ctx, 19 * T + 4, 3 * T + 4, 7 * T - 8, 2 * T - 14, C.white);
  label(ctx, 'RECORD 2026', 22.5 * T, 3 * T + 16, '#C2453A', 13);
  rect(ctx, 19.4 * T, 3.9 * T, 2.4 * T, 3, '#3B82C4');
  rect(ctx, 19.4 * T, 4.15 * T, 2.0 * T, 3, '#5F5E5A');
  rect(ctx, 23 * T, 3.9 * T, 2.4 * T, 3, '#5F5E5A');
  rect(ctx, 23 * T, 4.15 * T, 1.6 * T, 3, '#5F5E5A');
  rect(ctx, 19.4 * T, 5 * T - 4, 4, 6, '#777');
  rect(ctx, 25.4 * T, 5 * T - 4, 4, 6, '#777');

  // 풀업 리그: 기둥 + 철봉 + 링
  for (const row of [8, 14]) {
    rect(ctx, 5 * T + 12, row * T + 4, 16 * T + 8, 6, '#0E0E10');
    for (let x = 5; x <= 21; x += 4) {
      rect(ctx, x * T + 8, row * T - 6, 16, T + 4, '#0E0E10');
      rect(ctx, x * T + 11, row * T - 6, 3, T + 4, '#3A3A3F');
    }
    for (let x = 7; x <= 19; x += 4) {
      ctx.strokeStyle = '#C9A36B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x * T, row * T + 22, 6, 0, Math.PI * 2);
      ctx.stroke();
      rect(ctx, x * T - 1, row * T + 8, 2, 8, '#8C8B88');
    }
  }

  // 에어바이크
  for (const b of BIKES) {
    rect(ctx, b.x * T + 4, b.y * T + 6, T - 8, 2 * T - 12, '#1B1B1E');
    ctx.strokeStyle = '#5F5E5A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x * T + T / 2, b.y * T + T - 2, 9, 0, Math.PI * 2);
    ctx.stroke();
    rect(ctx, b.x * T + 6, b.y * T + 4, T - 12, 4, '#D9443E');
  }

  // 노란 기둥
  for (const p of PILLARS) {
    rect(ctx, p.x * T, p.y * T, p.w * T, p.h * T, '#B88F12');
    rect(ctx, p.x * T, p.y * T, p.w * T - 6, p.h * T - 6, C.yellow);
  }

  // 플라이오 박스
  for (const b of BOXES) {
    rect(ctx, b.x * T + 2, b.y * T + 2, b.w * T - 4, b.h * T - 4, '#A9845A');
    rect(ctx, b.x * T + 6, b.y * T + 6, b.w * T - 12, b.h * T - 12, '#C29A6B');
  }

  // 바벨/플레이트 랙
  rect(ctx, 1 * T, 13 * T, 3 * T, 7 * T, '#202024');
  const plateColors = ['#3B6FD1', '#3E9E5F', '#D9443E', '#E8B923', '#8C8B88'];
  for (let i = 0; i < 6; i++) {
    const py = 13.3 * T + i * 34;
    const color = plateColors[i % plateColors.length];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(1.8 * T, py + 12, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(1.8 * T, py + 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) rect(ctx, 2.9 * T + (i % 2) * 6, 13.4 * T + i * 30, 4, 26, ['#E58FB5', '#3B82C4', '#1B1B1E'][i % 3]);

  // 데스크 (원형 로고)
  rect(ctx, 29 * T, 19 * T, 7 * T, 3 * T - 4, '#DCD8D0');
  rect(ctx, 29 * T + 4, 19 * T + 4, 7 * T - 8, 2 * T, '#F6F4EF');
  ctx.fillStyle = '#1B1B1E';
  ctx.beginPath();
  ctx.arc(32.5 * T, 20 * T, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#F0C850';
  ctx.lineWidth = 2;
  ctx.stroke();
  label(ctx, 'CROSSFIT', 32.5 * T, 20 * T - 6, '#F0C850', 8);
  label(ctx, '051', 32.5 * T, 20 * T + 7, C.white, 13);
  rect(ctx, 30 * T, 19.3 * T, 14, 18, '#F2EEE4');
  rect(ctx, 34.6 * T, 19.4 * T, 10, 14, '#5BB0E8');

  // 정수기
  rect(ctx, COOLER.x * T + 4, COOLER.y * T + 2, T - 8, 2 * T - 6, '#EDEDED');
  rect(ctx, COOLER.x * T + 8, COOLER.y * T + 8, T - 16, 10, '#5BB0E8');
}

// 상호작용 가능한 오브젝트 위에 반짝이는 표시
export function drawObjectHint(ctx: CanvasRenderingContext2D, board: BoardKey, t: number) {
  const o = OBJECTS.find((x) => x.board === board);
  if (!o) return;
  const alpha = 0.55 + Math.sin(t / 180) * 0.25;
  ctx.strokeStyle = `rgba(232,185,35,${alpha})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(o.x * TILE - 2, o.y * TILE - 2, o.w * TILE + 4, o.h * TILE + 4);
}

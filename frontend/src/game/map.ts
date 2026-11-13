// 크로스핏051 박스를 탑뷰 픽셀 맵으로 옮긴다. 모든 그림은 코드로 그린다.
export const TILE = 32;
export const COLS = 34;
export const ROWS = 22;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const SPAWN = { x: 30.5 * TILE, y: 19.5 * TILE };

export type BoardKey = 'hub' | 'wod' | 'notices' | 'competition' | 'gathering' | 'one-rm' | 'wall' | 'qna';
export type ObjectKey = BoardKey;

// 이름만 보고도 무엇인지 알 수 있게 짓는다
export const BOARDS: Record<BoardKey, { label: string; icon: string; href: string; hint: string }> = {
  hub: { label: '게시판', icon: '🗂', href: '/board', hint: '모든 기능을 한눈에' },
  wod: { label: '오늘의 WOD', icon: '📋', href: '/wod', hint: 'WOD, 내 무게, 기록 사진' },
  notices: { label: '공지사항', icon: '📢', href: '/notices', hint: '박스 공지' },
  competition: { label: '대회·이벤트', icon: '🏆', href: '/events?kind=competition', hint: '대회와 이벤트 참가 신청' },
  gathering: { label: '회원 모임', icon: '🍻', href: '/events?kind=gathering', hint: '회식, 번개 모임' },
  'one-rm': { label: '1RM 기록', icon: '🏋️', href: '/one-rm', hint: '내 최고 기록과 박스 순위' },
  wall: { label: 'PR 명예의 벽', icon: '🎉', href: '/wall', hint: '회원들의 PR 축하' },
  qna: { label: 'Q&A 문의', icon: '💬', href: '/qna', hint: '관리자에게 1:1 문의 (나와 관리자만 볼 수 있어요)' },
};

export const OBJECT_LABELS: Record<ObjectKey, string> = {
  ...Object.fromEntries(Object.entries(BOARDS).map(([k, b]) => [k, `${b.icon} ${b.label}`])),
} as Record<ObjectKey, string>;

type Box = { x: number; y: number; w: number; h: number };

// 상호작용 오브젝트: 타일 좌표
// 상호작용 오브젝트: 게시판 키오스크 하나로 모은다 (모든 기능은 게시판에서)
export const OBJECTS: (Box & { board: ObjectKey })[] = [{ board: 'hub', x: 26, y: 19, w: 2, h: 1 }];

// 장식 (실제 박스 모습. 지나갈 수 없지만 상호작용은 없다)
const DECOR: Box[] = [
  { x: 2, y: 0, w: 6, h: 3 }, // 상장 벽
  { x: 9, y: 0, w: 7, h: 3 }, // 팀 배너
  { x: 13, y: 3, w: 7, h: 2 }, // RECORD 화이트보드
  { x: 23, y: 0, w: 5, h: 3 }, // 대회 포스터
  { x: 23, y: 16, w: 6, h: 3 }, // 데스크
];

// 장애물 (상호작용 없음)
const RIG_POSTS: [number, number][] = [];
const RIG_ROWS = [7, 12];
for (const row of RIG_ROWS) for (let x = 5; x <= 17; x += 4) RIG_POSTS.push([x, row]);
// 유산소 머신: 오른쪽 벽을 따라 위에서부터 한 줄 (가로 3칸, 회원은 왼쪽을 보고 탄다)
type MachineKind = 'rower' | 'ski' | 'bikeErg' | 'assault' | 'treadmill';
const MACHINE_INFO: Record<MachineKind, { label: string; icon: string }> = {
  rower: { label: '로잉머신', icon: '🚣' },
  ski: { label: '스키에르그', icon: '⛷' },
  bikeErg: { label: '바이크에르그', icon: '🚴' },
  assault: { label: '어썰트바이크', icon: '🚲' },
  treadmill: { label: '트레드밀', icon: '🏃' },
};
const MACHINE_ORDER: MachineKind[] = [
  'rower', 'rower', 'rower',
  'ski', 'ski',
  'bikeErg',
  'assault',
  'treadmill',
];
const MACHINES: (Box & { kind: MachineKind })[] = MACHINE_ORDER.map((kind, i) => ({ kind, x: 30, y: 3 + i * 2, w: 3, h: 1 })); // 사이에 한 칸씩 (캐릭터가 설 자리)

const PILLARS: Box[] = [
  { x: 21, y: 8, w: 2, h: 2 },
  { x: 21, y: 13, w: 2, h: 2 },
];
const BOXES: Box[] = [{ x: 17, y: 19, w: 2, h: 1 }]; // 플라이오 박스 (아래 벽 쪽 기구 줄)
const COOLER: Box = { x: 21, y: 3, w: 1, h: 2 }; // 정수기 (위쪽 벽, 화이트보드 옆)

// ---- 기구 랙 (장식)
type GearKey = 'barbell' | 'kettlebell' | 'dumbbell' | 'medball';
const GEAR_NAMES: Record<GearKey, string> = {
  barbell: '🏋️ 바벨·원판 랙',
  kettlebell: '🔔 케틀벨 랙',
  dumbbell: '💪 덤벨 랙',
  medball: '⚫ 메디신볼',
};
const STATIONS: (Box & { gear: GearKey })[] = [
  { gear: 'barbell', x: 1, y: 11, w: 3, h: 6 },
  { gear: 'kettlebell', x: 3, y: 19, w: 3, h: 1 },
  { gear: 'dumbbell', x: 8, y: 19, w: 3, h: 1 },
  { gear: 'medball', x: 13, y: 19, w: 3, h: 1 },
];

// 눌렀을 때 이름을 알려줄 구조물들
const NAMED: (Box & { name: string })[] = [
  { x: 2, y: 0, w: 6, h: 3, name: '🏅 상장 벽' },
  { x: 9, y: 0, w: 7, h: 3, name: '🚩 팀 배너' },
  { x: 13, y: 3, w: 7, h: 2, name: '📝 RECORD 화이트보드' },
  { x: 23, y: 0, w: 5, h: 3, name: '🏆 대회 포스터' },
  { x: 23, y: 16, w: 6, h: 3, name: '🛎 데스크' },
  ...PILLARS.map((b) => ({ ...b, name: '노란 기둥' })),
  ...RIG_ROWS.map((y) => ({ x: 5, y, w: 13, h: 1, name: '🤸 풀업 리그' })),
  ...BOXES.map((b) => ({ ...b, name: '📦 플라이오 박스' })),
  { ...COOLER, name: '💧 정수기' },
  ...MACHINES.map((m) => ({ ...m, name: `${MACHINE_INFO[m.kind].icon} ${MACHINE_INFO[m.kind].label}` })),
  ...STATIONS.map((st) => ({ ...st, name: GEAR_NAMES[st.gear] })),
];

const ENTRANCE_X = 29; // 입구 (아래 벽, 3칸)

export const solid: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
function block(b: Box) {
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (solid[y]) solid[y][x] = true;
}
for (let x = 0; x < COLS; x++) {
  block({ x, y: 0, w: 1, h: 3 });
  if (x < ENTRANCE_X || x > ENTRANCE_X + 2) block({ x, y: ROWS - 1, w: 1, h: 1 });
}
for (let y = 0; y < ROWS; y++) {
  block({ x: 0, y, w: 1, h: 1 });
  block({ x: COLS - 1, y, w: 1, h: 1 });
}
OBJECTS.forEach(block);
DECOR.forEach(block);
RIG_POSTS.forEach(([x, y]) => block({ x, y, w: 1, h: 1 }));
STATIONS.forEach(block);
[...MACHINES, ...PILLARS, ...BOXES, COOLER].forEach(block);

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
export function nearbyBoard(x: number, y: number): ObjectKey | null {
  const tx = x / TILE;
  const ty = (y - 4) / TILE;
  let best: ObjectKey | null = null;
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

// 누른 곳의 구조물 이름 (이름표 대신 잠깐 보여준다)
export function nameAt(wx: number, wy: number): { name: string; x: number; y: number } | null {
  const o = NAMED.find((b) => wx >= b.x * TILE && wx <= (b.x + b.w) * TILE && wy >= b.y * TILE && wy <= (b.y + b.h) * TILE);
  return o ? { name: o.name, x: (o.x + o.w / 2) * TILE, y: o.y * TILE } : null;
}

// 누르면 바로 해당 게시판이 열리는 구조물 (걸어가지 않아도 됨)
const SHORTCUTS: (Box & { board: ObjectKey })[] = [
  { x: 23, y: 16, w: 6, h: 3, board: 'notices' }, // 🛎 데스크 → 공지사항
  { x: 23, y: 0, w: 5, h: 3, board: 'competition' }, // 🏆 대회 포스터 → 대회·이벤트
  { x: 13, y: 3, w: 7, h: 2, board: 'wod' }, // 📝 RECORD 화이트보드 → 오늘의 WOD
  { x: 2, y: 0, w: 6, h: 3, board: 'wall' }, // 🏅 상장 벽 → PR 명예의 벽
  { x: 1, y: 11, w: 3, h: 6, board: 'one-rm' }, // 🏋️ 바벨·원판 랙 → 1RM 기록
  { x: 3, y: 19, w: 3, h: 1, board: 'one-rm' }, // 🔔 케틀벨 랙 → 1RM 기록
  { x: 8, y: 19, w: 3, h: 1, board: 'one-rm' }, // 💪 덤벨 랙 → 1RM 기록
  { x: 9, y: 0, w: 7, h: 3, board: 'gathering' }, // 🚩 팀 배너 → 회원 모임
];

export function shortcutAt(wx: number, wy: number): ObjectKey | null {
  const o = SHORTCUTS.find((b) => wx >= b.x * TILE && wx <= (b.x + b.w) * TILE && wy >= b.y * TILE && wy <= (b.y + b.h) * TILE);
  return o ? o.board : null;
}

// 특정 오브젝트에 손이 닿는 거리인지
export function isNear(board: ObjectKey, x: number, y: number): boolean {
  const o = OBJECTS.find((b) => b.board === board);
  if (!o) return false;
  const tx = x / TILE;
  const ty = (y - 4) / TILE;
  const dx = Math.max(o.x - tx, 0, tx - (o.x + o.w));
  const dy = Math.max(o.y - ty, 0, ty - (o.y + o.h));
  return Math.hypot(dx, dy) < 1.1;
}

// 클릭한 지점에 있는 오브젝트 (주변 4px 여유)
export function objectAt(wx: number, wy: number): ObjectKey | null {
  for (const o of OBJECTS) {
    // 오브젝트 본체 + 이름표(위 또는 아래 약 28px)까지 클릭 범위로 본다
    if (wx >= o.x * TILE - 6 && wx <= (o.x + o.w) * TILE + 6 && wy >= o.y * TILE - 28 && wy <= (o.y + o.h) * TILE + 28) {
      return o.board;
    }
  }
  return null;
}


// 탭한 곳까지 타일 단위로 길 찾기 (BFS)
export function findPath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
  const sx = Math.floor(fromX / TILE);
  const sy = Math.floor((fromY - 4) / TILE);
  let gx = Math.floor(toX / TILE);
  let gy = Math.floor(toY / TILE);
  gx = Math.max(0, Math.min(COLS - 1, gx));
  gy = Math.max(0, Math.min(ROWS - 1, gy));
  // 막힌 곳을 누르면 누른 지점에서 가장 가까운 빈 칸으로
  if (solid[gy][gx]) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || solid[ny][nx]) continue;
        const d = Math.hypot((nx + 0.5) * TILE - toX, (ny + 0.5) * TILE - toY);
        if (d < bestD) {
          bestD = d;
          best = [nx, ny];
        }
      }
    }
    if (!best) return [];
    [gx, gy] = best;
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
      const walk = x >= 21;
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
  rect(ctx, 5 * T, 17 * T, 13 * T, 2, '#BDBDBD');

  // 벽 (위, 좌우, 아래)
  rect(ctx, 0, 0, WORLD_W, 3 * T, C.wall);
  rect(ctx, 0, 3 * T - 6, WORLD_W, 6, C.wallShade);
  rect(ctx, 0, 1.55 * T, WORLD_W, 8, C.burgundy);
  rect(ctx, 0, 1.55 * T + 8, WORLD_W, 5, C.yellow);
  rect(ctx, 0, 3 * T, T, WORLD_H, C.wallShade);
  rect(ctx, WORLD_W - T, 3 * T, T, WORLD_H, C.wallShade);
  rect(ctx, 0, WORLD_H - T, ENTRANCE_X * T, T, C.wallShade);
  rect(ctx, (ENTRANCE_X + 3) * T, WORLD_H - T, (COLS - ENTRANCE_X - 3) * T, T, C.wallShade);
  // 입구
  rect(ctx, ENTRANCE_X * T, WORLD_H - T, 3 * T, T, '#5C5C63');
  label(ctx, '입구', (ENTRANCE_X + 1.5) * T, WORLD_H - T / 2, '#E8E8E8', 12);

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
  rect(ctx, 23.3 * T, 0.2 * T, 4.4 * T, 2.5 * T, '#2F6FD1');
  rect(ctx, 23.3 * T + 4, 0.2 * T + 4, 4.4 * T - 8, 2.5 * T - 8, '#3E82E6');
  label(ctx, '멋지다 051', 25.5 * T, 0.8 * T, C.white, 13);
  label(ctx, 'COMPETITION', 25.5 * T, 1.55 * T, '#FFE27A', 11);
  rect(ctx, 24.6 * T, 1.95 * T, 1.8 * T, 6, C.yellow);

  // RECORD 화이트보드 (스탠드형)
  rect(ctx, 13 * T, 3 * T, 7 * T, 2 * T - 6, '#9A9A9A');
  rect(ctx, 13 * T + 4, 3 * T + 4, 7 * T - 8, 2 * T - 14, C.white);
  label(ctx, 'RECORD 2026', 16.5 * T, 3 * T + 16, '#C2453A', 13);
  rect(ctx, 13.4 * T, 3.9 * T, 2.4 * T, 3, '#3B82C4');
  rect(ctx, 13.4 * T, 4.15 * T, 2.0 * T, 3, '#5F5E5A');
  rect(ctx, 17 * T, 3.9 * T, 2.4 * T, 3, '#5F5E5A');
  rect(ctx, 17 * T, 4.15 * T, 1.6 * T, 3, '#5F5E5A');
  rect(ctx, 13.4 * T, 5 * T - 4, 4, 6, '#777');
  rect(ctx, 19.4 * T, 5 * T - 4, 4, 6, '#777');

  // 풀업 리그: 기둥 + 철봉 + 링
  for (const row of RIG_ROWS) {
    rect(ctx, 5 * T + 12, row * T + 4, 12 * T + 8, 6, '#0E0E10');
    for (let x = 5; x <= 17; x += 4) {
      rect(ctx, x * T + 8, row * T - 6, 16, T + 4, '#0E0E10');
      rect(ctx, x * T + 11, row * T - 6, 3, T + 4, '#3A3A3F');
    }
    for (let x = 7; x <= 15; x += 4) {
      ctx.strokeStyle = '#C9A36B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x * T, row * T + 22, 6, 0, Math.PI * 2);
      ctx.stroke();
      rect(ctx, x * T - 1, row * T + 8, 2, 8, '#8C8B88');
    }
  }

  // 유산소 머신 줄 (오른쪽 벽)
  for (const m of MACHINES) drawMachine(ctx, m);

  // 노란 기둥
  for (const p of PILLARS) {
    rect(ctx, p.x * T, p.y * T, p.w * T, p.h * T, '#B88F12');
    rect(ctx, p.x * T, p.y * T, p.w * T - 6, p.h * T - 6, C.yellow);
  }

  // 플라이오 박스 (두 개, 높이 표시)
  for (const b of BOXES) {
    for (let i = 0; i < b.w; i++) {
      const x0 = (b.x + i) * T;
      rect(ctx, x0 + 2, b.y * T + 2, T - 4, T - 4, '#7A5A36');
      rect(ctx, x0 + 4, b.y * T + 4, T - 8, T - 8, '#B98B57');
      rect(ctx, x0 + 4, b.y * T + 14, T - 8, 3, '#7A5A36');
      label(ctx, i ? '20' : '24', x0 + T / 2, b.y * T + 9, '#2A2320', 8);
    }
  }

  // 케틀벨 랙
  const kb = STATIONS.find((s) => s.gear === 'kettlebell')!;
  rect(ctx, kb.x * T + 2, kb.y * T + 18, kb.w * T - 4, 10, '#2B2B30');
  ['#E8B923', '#3E9E5F', '#3B6FD1', '#D9443E', '#8C5BB0'].forEach((c, i) => {
    const cx = kb.x * T + 12 + i * 18;
    ctx.fillStyle = '#17171A';
    ctx.beginPath();
    ctx.arc(cx, kb.y * T + 14, 7, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, cx - 5, kb.y * T + 8, 10, 3, c);
    ctx.strokeStyle = '#17171A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, kb.y * T + 7, 4, Math.PI, 0);
    ctx.stroke();
  });

  // 덤벨 랙
  const db = STATIONS.find((s) => s.gear === 'dumbbell')!;
  rect(ctx, db.x * T + 2, db.y * T + 4, db.w * T - 4, T - 6, '#2B2B30');
  for (let i = 0; i < 4; i++) {
    const x0 = db.x * T + 8 + i * 22;
    for (const row of [0, 1]) {
      const y0 = db.y * T + 9 + row * 12;
      rect(ctx, x0, y0, 4, 7, '#17171A');
      rect(ctx, x0 + 4, y0 + 2, 8, 3, '#9C9C9C');
      rect(ctx, x0 + 12, y0, 4, 7, '#17171A');
    }
  }

  // 메디신볼 더미
  const mb = STATIONS.find((s) => s.gear === 'medball')!;
  ['#3B3B40', '#D9443E', '#3B6FD1', '#3E9E5F'].forEach((c, i) => {
    const cx = mb.x * T + 14 + i * 22;
    const cy = mb.y * T + 16 + (i % 2) * 3;
    ctx.fillStyle = '#17171A';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, cx - 8, cy - 1, 16, 2, '#17171A');
  });

  // 바벨/플레이트 랙
  rect(ctx, 1 * T, 11 * T, 3 * T, 6 * T, '#202024');
  const plateColors = ['#3B6FD1', '#3E9E5F', '#D9443E', '#E8B923', '#8C8B88'];
  for (let i = 0; i < 5; i++) {
    const py = 11.3 * T + i * 36;
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
  for (let i = 0; i < 6; i++) rect(ctx, 2.9 * T + (i % 2) * 6, 11.4 * T + i * 30, 4, 26, ['#E58FB5', '#3B82C4', '#1B1B1E'][i % 3]);

  // 데스크 (원형 로고)
  rect(ctx, 23 * T, 16 * T, 6 * T, 3 * T - 4, '#DCD8D0');
  rect(ctx, 23 * T + 4, 16 * T + 4, 6 * T - 8, 2 * T, '#F6F4EF');
  ctx.fillStyle = '#1B1B1E';
  ctx.beginPath();
  ctx.arc(26 * T, 17 * T, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#F0C850';
  ctx.lineWidth = 2;
  ctx.stroke();
  label(ctx, 'CROSSFIT', 26 * T, 17 * T - 6, '#F0C850', 8);
  label(ctx, '051', 26 * T, 17 * T + 7, C.white, 13);
  rect(ctx, 23.6 * T, 16.3 * T, 14, 18, '#F2EEE4');
  rect(ctx, 27.8 * T, 16.4 * T, 10, 14, '#5BB0E8');

  // 정수기 (위에 파란 물통)
  rect(ctx, COOLER.x * T + 5, COOLER.y * T + 14, T - 10, 2 * T - 18, '#EDEDED');
  rect(ctx, COOLER.x * T + 5, COOLER.y * T + 14, T - 10, 3, '#CFCFCF');
  ctx.fillStyle = '#7CC4F0';
  ctx.beginPath();
  ctx.roundRect(COOLER.x * T + 8, COOLER.y * T + 1, T - 16, 14, 4);
  ctx.fill();
  rect(ctx, COOLER.x * T + 10, COOLER.y * T + 3, 3, 9, '#B9E1F8');
  rect(ctx, COOLER.x * T + 10, COOLER.y * T + 26, 4, 3, '#3B82C4');
  rect(ctx, COOLER.x * T + 18, COOLER.y * T + 26, 4, 3, '#D9443E');

  // 게시판 키오스크 (입구 옆)
  const kx = OBJECTS[0].x;
  const ky = OBJECTS[0].y;
  rect(ctx, kx * T + 4, ky * T - 10, 2 * T - 8, T + 6, '#2B2B30');
  rect(ctx, kx * T + 8, ky * T - 6, 2 * T - 16, T - 6, '#3E82E6');
  for (let i = 0; i < 3; i++) rect(ctx, kx * T + 12, ky * T - 1 + i * 6, 2 * T - 24, 3, '#CFE2FF');
  rect(ctx, (kx + 1) * T - 3, (ky + 1) * T - 4, 6, 4, '#2B2B30');

  // 이름표: 무엇인지 이름만 보고 알 수 있게
  for (const o of OBJECTS) {
    const text = OBJECT_LABELS[o.board];
    const cx = (o.x + o.w / 2) * T;
    // 위쪽 벽에 걸린 것은 아래에, 나머지는 위에 단다
    const cy = o.y === 0 ? 3 * T + 12 : o.board === 'wod' ? (o.y + o.h) * T + 10 : o.y * T - 16;
    ctx.font = 'bold 12px system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(20,20,22,0.82)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - 10, w, 20, 6);
    ctx.fill();
    ctx.strokeStyle = '#E8B923';
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, text, cx, cy + 1, '#FFFFFF', 12);
  }
}

// 상호작용 가능한 오브젝트 위에 반짝이는 표시
export function drawObjectHint(ctx: CanvasRenderingContext2D, board: ObjectKey, t: number) {
  const o = OBJECTS.find((x) => x.board === board);
  if (o) drawBoxHint(ctx, o, t);
}

function drawBoxHint(ctx: CanvasRenderingContext2D, o: Box, t: number) {
  const alpha = 0.55 + Math.sin(t / 180) * 0.25;
  ctx.strokeStyle = `rgba(232,185,35,${alpha})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(o.x * TILE - 2, o.y * TILE - 2, o.w * TILE + 4, o.h * TILE + 4);
}

// 머신 하나 그리기 (가로 3칸, 오른쪽이 벽)
function drawMachine(ctx: CanvasRenderingContext2D, m: Box & { kind: MachineKind }) {
  const T = TILE;
  const x0 = m.x * T;
  const y0 = m.y * T;
  // 그림은 "벽쪽이 앞"으로 그려져 있어서 좌우를 뒤집어, 머신 앞이 넓은 필드(왼쪽)를 보게 한다
  ctx.save();
  ctx.translate(2 * x0 + 3 * T, 0);
  ctx.scale(-1, 1);
  const r = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, x0 + x, y0 + y, w, h, c);
  const wheel = (cx: number, cy: number, rad: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x0 + cx, y0 + cy, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  // 바닥 고무판
  r(2, 3, 3 * T - 4, T - 6, '#2E2E33');
  if (m.kind === 'rower') {
    r(8, 13, 62, 5, '#A8A8A8'); // 레일
    r(8, 14, 62, 2, '#D0D0D0');
    r(68, 5, 24, 22, '#1B1B1E'); // 플라이휠 통 (벽쪽)
    wheel(80, 16, 8, '#3A3A40');
    r(76, 3, 8, 4, '#5BB0E8');
    r(62, 8, 5, 16, '#2B2B30'); // 발판
    r(50, 10, 10, 11, '#1F1F22'); // 시트
  } else if (m.kind === 'ski') {
    r(78, 2, 14, 28, '#1B1B1E'); // 벽에 붙은 기둥
    r(81, 5, 8, 6, '#5BB0E8');
    r(64, 9, 14, 2, '#6B6B70');
    r(64, 21, 14, 2, '#6B6B70');
    r(60, 7, 5, 6, '#D9443E');
    r(60, 19, 5, 6, '#D9443E');
    r(40, 6, 22, 20, '#3A3A40'); // 발판
  } else if (m.kind === 'bikeErg') {
    r(70, 6, 20, 20, '#1B1B1E');
    wheel(80, 16, 7, '#4A4A50');
    r(66, 6, 6, 4, '#5BB0E8');
    r(34, 14, 38, 4, '#2B2B30'); // 몸체
    r(40, 10, 10, 12, '#1F1F22'); // 안장
    r(62, 8, 4, 16, '#6B6B70'); // 핸들
  } else if (m.kind === 'assault') {
    ctx.strokeStyle = '#6B6B70';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x0 + 78, y0 + 16, 11, 0, Math.PI * 2);
    ctx.stroke();
    wheel(78, 16, 4, '#D9443E');
    r(34, 14, 40, 4, '#1B1B1E');
    r(40, 10, 10, 12, '#1F1F22');
    r(58, 4, 3, 24, '#D9443E'); // 팔 손잡이
    r(64, 4, 3, 24, '#D9443E');
  } else {
    r(8, 6, 80, 20, '#1B1B1E'); // 벨트 틀
    r(12, 9, 66, 14, '#3A3A40'); // 벨트
    for (let i = 0; i < 6; i++) r(14 + i * 11, 9, 1, 14, '#4A4A50');
    r(80, 4, 10, 24, '#2B2B30'); // 콘솔
    r(82, 8, 6, 8, '#5BB0E8');
  }
  ctx.restore();
}

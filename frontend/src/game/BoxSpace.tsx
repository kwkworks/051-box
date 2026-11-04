'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { normalizeAvatar, type Avatar } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, Profile } from '@/lib/types';
import { SPRITE_H, drawAvatar, type Dir, type Pose } from './avatar';
import {
  BAR_MAX_X, BAR_MIN_X, BAR_ROWS, GEAR, GEAR_KEYS, MACHINES, MACHINE_INFO, OBJECT_LABELS, SPAWN, WORLD_H, WORLD_W, collides, drawGear, drawObjectHint, drawStaticMap,
  drawStationHint, findPath, isNear, isNearStation, machineAt, nameAt, nearbyBoard, nearbyMachine, nearbyStation,
  objectAt, seatOf, stationAt, barAt, hangY, nearbyBar,
  type GearKey, type ObjectKey,
} from './map';

type Player = {
  id: string;
  nickname: string;
  avatar: Avatar;
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Dir;
  moving: boolean;
  pose: Pose;
  running: boolean;
  jumpStart?: number;
  hold: GearKey | null; // 들고 있는 운동기구
  liftStart?: number; // 기구 들어올리기 시작 시각
  ride: number | null; // 타고 있는 머신 번호
  hang: number | null; // 매달린 철봉 줄 (8 또는 14)
  pullStart?: number; // 풀업 시작 시각
  chat?: string;
  chatUntil?: number;
};

export type BoxSpaceHandle = {
  // 내가 보낸 메시지를 실시간 수신보다 먼저 말풍선으로 보여준다
  showMyBubble: (text: string) => void;
  // 모바일 액션 버튼에서 호출
  act: (action: Action) => void;
  // 화면 확대/축소 (+1 확대, -1 축소). 바뀐 배율(1 = 기본)을 돌려준다
  zoomBy: (dir: 1 | -1) => number;
};

export type Action = 'jump' | 'sit' | 'dance' | 'run' | 'grab' | 'ride' | 'hang';
export type ActionState = { pose: Pose; running: boolean; hold: GearKey | null; ride: number | null; hang: number | null };

const HANG_SPEED = 70;
const PULL_MS = 650;

const JOY_R = 48; // 조이스틱 반경 (CSS px)

const LIFT_MS = 700;

const SPEED = 150; // 초당 이동 픽셀
const RUN_SPEED = 260;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
const JUMP_MS = 560;
// 점프 동작: 웅크림(준비) → 공중(팔 번쩍, 포물선) → 착지(살짝 눌림)
const JUMP_PREP = 90;
const JUMP_LAND = 100;
const JUMP_HEIGHT = 26;
function jumpState(t: number): { lift: number; squash: number; air: boolean } {
  if (t < 0 || t >= JUMP_MS) return { lift: 0, squash: 1, air: false };
  if (t < JUMP_PREP) return { lift: 0, squash: 1 - 0.18 * Math.sin((Math.PI / 2) * (t / JUMP_PREP)), air: false };
  const airMs = JUMP_MS - JUMP_PREP - JUMP_LAND;
  if (t < JUMP_PREP + airMs) {
    const u = (t - JUMP_PREP) / airMs;
    // 이륙/낙하 순간엔 몸이 길게, 꼭대기에선 원래대로
    return { lift: 4 * JUMP_HEIGHT * u * (1 - u), squash: 1 + 0.1 * Math.abs(1 - 2 * u), air: true };
  }
  const v = (t - JUMP_PREP - airMs) / JUMP_LAND;
  return { lift: 0, squash: 1 - 0.15 * Math.sin(Math.PI * v), air: false };
}
const POSES: Pose[] = ['stand', 'sit', 'dance'];
const SPRITE_SCALE = 1.4;
const BUBBLE_MAX = 60;
const POS_KEY = 'box-space-pos';
const DIRS: Dir[] = ['down', 'up', 'left', 'right'];
const UUID = /^[0-9a-f-]{36}$/i;

function clampNum(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null;
}

// 다른 회원이 보낸 데이터는 그대로 믿지 않고 형식과 범위를 검사한다
function readPeer(raw: Record<string, unknown>) {
  const x = clampNum(raw.x, 0, WORLD_W);
  const y = clampNum(raw.y, 0, WORLD_H);
  if (x === null || y === null) return null;
  const dir = DIRS.includes(raw.dir as Dir) ? (raw.dir as Dir) : 'down';
  const pose = POSES.includes(raw.pose as Pose) ? (raw.pose as Pose) : 'stand';
  const hold = GEAR_KEYS.includes(raw.hold as GearKey) ? (raw.hold as GearKey) : null;
  const ride = Number.isInteger(raw.ride) && (raw.ride as number) >= 0 && (raw.ride as number) < MACHINES.length ? (raw.ride as number) : null;
  const hang = BAR_ROWS.includes(raw.hang as (typeof BAR_ROWS)[number]) ? (raw.hang as number) : null;
  return { x, y, dir, moving: raw.moving === true, pose, running: raw.running === true, hold, ride, hang };
}

// 머신 위 동작: 종류마다 다르게 움직인다 (모두 왼쪽을 본다)
function drawRider(ctx: CanvasRenderingContext2D, p: Player, now: number) {
  const kind = MACHINES[p.ride!].kind;
  const S = SPRITE_SCALE;
  if (kind === 'rower') {
    // 시트가 앞뒤로 미끄러지며 당기기
    const phase = Math.sin(now / 380);
    drawAvatar(ctx, p.avatar, p.x + phase * 8, p.y, 'left', phase > 0 ? 1 : 2, S, 'sit');
  } else if (kind === 'ski') {
    // 팔을 머리 위로 올렸다가 몸을 숙이며 끌어내리기
    const t = (now % 1100) / 1100;
    const top = t < 0.45;
    drawAvatar(ctx, p.avatar, p.x, p.y, 'left', 0, S, top ? 'air' : 'stand', 0, top ? 1.04 : 0.88);
  } else if (kind === 'bikeErg') {
    const bob = Math.abs(Math.sin(now / 220)) * 1.5;
    drawAvatar(ctx, p.avatar, p.x, p.y, 'left', Math.floor(now / 220) % 2 ? 1 : 2, S, 'sit', bob);
  } else if (kind === 'assault') {
    const bob = Math.abs(Math.sin(now / 150)) * 2;
    drawAvatar(ctx, p.avatar, p.x, p.y, 'left', Math.floor(now / 150) % 2 ? 1 : 2, S, 'sit', bob);
  } else {
    // 트레드밀: 제자리 달리기
    const bob = Math.abs(Math.sin(now / 100)) * 2;
    drawAvatar(ctx, p.avatar, p.x, p.y, 'left', (Math.floor(now / 100) % 2) + 1, S, 'stand', bob);
  }
}

function cleanText(v: unknown, max: number) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function loadPos() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(POS_KEY) ?? 'null');
    if (raw && typeof raw.x === 'number' && typeof raw.y === 'number' && !collides(raw.x, raw.y)) return raw;
  } catch {}
  return SPAWN;
}

export function BoxSpace({
  profile,
  onOpen,
  onNearbyChange,
  onActionState,
  onChat,
  onRequestChat,
  handleRef,
}: {
  profile: Profile;
  onOpen: (target: ObjectKey) => void;
  onNearbyChange?: (target: ObjectKey | null) => void;
  onActionState?: (state: ActionState) => void;
  onChat?: (message: ChatMessage) => void;
  onRequestChat?: () => void;
  handleRef?: React.RefObject<BoxSpaceHandle | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState<ObjectKey | null>(null);
  const [gearUi, setGearUi] = useState<{
    station: GearKey | null; hold: GearKey | null; machine: number | null; ride: number | null; bar: number | null; hang: number | null;
  }>({ station: null, hold: null, machine: null, ride: null, bar: null, hang: null });
  const hangRef = useRef<() => void>(() => {});
  const rideRef = useRef<() => void>(() => {});
  const grabRef = useRef<() => void>(() => {});
  const [online, setOnline] = useState(1);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [connError, setConnError] = useState<string | null>(null);
  const avatarKey = JSON.stringify(normalizeAvatar(profile.avatar));
  const callbacks = useRef({ onOpen, onNearbyChange, onActionState, onChat, onRequestChat });
  useEffect(() => {
    callbacks.current = { onOpen, onNearbyChange, onActionState, onChat, onRequestChat };
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;

    // 배경은 한 번만 그려서 재사용
    const bg = document.createElement('canvas');
    bg.width = WORLD_W;
    bg.height = WORLD_H;
    drawStaticMap(bg.getContext('2d')!);

    const start = loadPos();
    const me: Player = {
      id: profile.id, nickname: profile.nickname, avatar: JSON.parse(avatarKey) as Avatar,
      x: start.x, y: start.y, tx: start.x, ty: start.y, dir: 'up', moving: false, pose: 'stand', running: false,
      hold: null, ride: null, hang: null,
    };
    const peers = new Map<string, Player>();
    const keys = new Set<string>();
    let path: { x: number; y: number }[] = [];
    let pendingOpen: ObjectKey | null = null; // 클릭한 오브젝트에 도착하면 연다
    let zoom = 1.5;
    let baseZoom = 1.5;
    let userZoom = 1;
    try {
      const saved = Number(localStorage.getItem('box-zoom'));
      if (saved >= ZOOM_MIN && saved <= ZOOM_MAX) userZoom = saved;
    } catch {}
    let cam = { x: 0, y: 0 };
    let raf = 0;
    let last = performance.now();
    let lastSent = 0;
    let lastSentKey = '';
    let currentNearby: ObjectKey | null = null;
    let currentStation: GearKey | null = null;
    let pendingGear: GearKey | null = null; // 기구 자리를 누르면 걸어가서 집는다
    let currentMachine: number | null = null;
    let currentBar: number | null = null;
    let pendingBar: number | null = null;
    let pendingMachine: number | null = null;
    // 플로팅 조이스틱 (휴대폰): 누른 자리에 생기고, 밀면 이동. 조금만 누르고 떼면 기존처럼 그 자리로 이동
    let joy: { id: number; sx: number; sy: number; cx: number; cy: number; active: boolean } | null = null;
    let flash: { text: string; x: number; y: number; until: number } | null = null; // 누른 구조물 이름
    let runToggle = false; // 모바일: 달리기 켜기/끄기
    let channel: RealtimeChannel | null = null;
    let subscribed = false; // 채널 연결이 끝난 뒤에만 보낸다
    let disposed = false;

    const bubble = (p: Player, text: string) => {
      p.chat = cleanText(text, BUBBLE_MAX);
      p.chatUntil = performance.now() + 6000;
    };
    const sendAct = (type: 'jump' | 'lift' | 'pull') => {
      if (subscribed) channel?.send({ type: 'broadcast', event: 'act', payload: { id: me.id, type } });
    };
    const notify = () => {
      callbacks.current.onActionState?.({ pose: me.pose, running: runToggle, hold: me.hold, ride: me.ride, hang: me.hang });
      setGearUi({ station: currentStation, hold: me.hold, machine: currentMachine, ride: me.ride, bar: currentBar, hang: me.hang });
    };
    // 철봉 매달리기/내려오기
    const grabBar = (row: number) => {
      me.hang = row;
      me.hold = null;
      me.pose = 'stand';
      me.x = me.tx = Math.max(BAR_MIN_X, Math.min(BAR_MAX_X, me.x));
      me.y = me.ty = hangY(row);
      me.dir = 'down';
      path = [];
      lastSentKey = '';
      notify();
    };
    const dropBar = () => {
      if (me.hang === null) return;
      me.hang = null;
      lastSentKey = '';
      notify();
    };
    const toggleHang = () => {
      if (me.hang !== null) dropBar();
      else if (currentBar !== null) grabBar(currentBar);
    };
    hangRef.current = toggleHang;
    // 머신 타기/내리기
    const mount = (i: number) => {
      const seat = seatOf(i);
      me.ride = i;
      me.hold = null;
      me.pose = 'stand';
      me.x = me.tx = seat.x;
      me.y = me.ty = seat.y;
      me.dir = 'left';
      path = [];
      lastSentKey = '';
      notify();
    };
    const dismount = () => {
      if (me.ride === null) return;
      const seat = seatOf(me.ride);
      me.ride = null;
      me.x = me.tx = 35.5 * 32;
      me.y = me.ty = seat.y;
      lastSentKey = '';
      notify();
    };
    const toggleRide = () => {
      if (me.ride !== null) dismount();
      else if (currentMachine !== null) mount(currentMachine);
    };
    rideRef.current = toggleRide;
    // 기구 집기/내려놓기: 들고 있으면 내려놓고(제자리로), 기구 자리 옆이면 집는다
    const grab = (gear: GearKey | null = currentStation) => {
      if (me.hold && (!gear || gear === me.hold)) me.hold = null;
      else if (gear) me.hold = gear;
      else return;
      if (me.pose === 'sit') me.pose = 'stand';
      lastSentKey = '';
      notify();
    };
    grabRef.current = () => grab();
    const act = (action: Action) => {
      const now = performance.now();
      if (action === 'ride') {
        toggleRide();
        return;
      }
      if (me.ride !== null) return; // 머신 위에서는 다른 동작 없음
      if (action === 'hang') {
        toggleHang();
        return;
      }
      if (me.hang !== null) {
        // 철봉 위: Space(점프)는 풀업, 나머지는 내려오기
        if (action === 'jump') {
          if (me.pullStart && now - me.pullStart < PULL_MS) return;
          me.pullStart = now;
          sendAct('pull');
        } else if (action !== 'run') dropBar();
        return;
      }
      if (action === 'grab') {
        grab(me.hold ?? currentStation); // 메뉴의 "내려놓기"는 항상 내려놓는다
        return;
      }
      if (action === 'jump' && me.hold) {
        // 기구를 들고 있으면 점프 대신 머리 위로 들어올리기
        if (me.liftStart && now - me.liftStart < LIFT_MS) return;
        me.liftStart = now;
        sendAct('lift');
        return;
      }
      if (action === 'jump') {
        if (me.jumpStart && now - me.jumpStart < JUMP_MS) return;
        me.jumpStart = now;
        sendAct('jump');
      } else if (action === 'run') {
        runToggle = !runToggle;
      } else {
        me.pose = me.pose === action ? 'stand' : action;
        if (me.pose === 'dance') me.dir = 'down';
        lastSentKey = ''; // 자세가 바뀌면 바로 알린다
      }
      notify();
    };
    const zoomBy = (dir: 1 | -1) => {
      userZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((userZoom + dir * 0.2) * 10) / 10));
      zoom = baseZoom * userZoom;
      try {
        localStorage.setItem('box-zoom', String(userZoom));
      } catch {}
      return userZoom;
    };
    if (handleRef) handleRef.current = { showMyBubble: (text) => bubble(me, text), act, zoomBy };

    // ---- 화면 크기
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // 휴대폰은 더 넓게 보이도록 기본 배율을 낮춘다
      baseZoom = (width < 640 ? 0.8 : width < 1024 ? 1.25 : 1.6) * dpr;
      zoom = baseZoom * userZoom;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- 키보드 (한글 입력 상태에서도 동작하도록 물리 키 코드로 판단)
    // 방향키/WASD 이동, Shift 달리기, Space 점프, C 앉기, Q 춤, E 열기, Enter 채팅
    const MOVE_CODES: Record<string, string> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    };
    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping() || e.isComposing) return;
      const move = MOVE_CODES[e.code];
      if (move && me.hang !== null && (move === 'up' || move === 'down')) {
        e.preventDefault();
        dropBar();
        return;
      }
      if (move) {
        dismount(); // 움직이면 머신에서 내린다
        keys.add(move);
        path = [];
        pendingOpen = null;
        e.preventDefault();
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        keys.add('run');
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        callbacks.current.onRequestChat?.();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) act('jump');
      } else if (e.code === 'KeyC' && !e.repeat) {
        act('sit');
      } else if (e.code === 'KeyQ' && !e.repeat) {
        act('dance');
      } else if (e.code === 'KeyE' && !e.repeat && me.ride !== null) {
        e.preventDefault();
        dismount();
      } else if (e.code === 'KeyE' && !e.repeat && me.hang !== null) {
        e.preventDefault();
        dropBar();
      } else if (e.code === 'KeyE' && currentNearby) {
        e.preventDefault();
        callbacks.current.onOpen(currentNearby);
      } else if (e.code === 'KeyE' && !e.repeat && currentMachine !== null && !currentStation && !me.hold) {
        e.preventDefault();
        mount(currentMachine);
      } else if ((e.code === 'KeyE' || e.code === 'KeyF') && !e.repeat && (currentStation || me.hold)) {
        e.preventDefault();
        grab();
      } else if (e.code === 'KeyE' && !e.repeat && currentBar !== null) {
        e.preventDefault();
        grabBar(currentBar);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const move = MOVE_CODES[e.code];
      if (move) keys.delete(move);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('run');
    };
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ---- 클릭/탭: 빈 곳은 이동, 오브젝트는 걸어가서 열기
    const toWorld = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      return { wx: ((e.clientX - r.left) * dpr) / zoom + cam.x, wy: ((e.clientY - r.top) * dpr) / zoom + cam.y };
    };
    const tapAt = (e: PointerEvent) => {
      const { wx, wy } = toWorld(e);
      if (me.ride !== null) {
        const m = machineAt(wx, wy);
        if (m === me.ride) return;
        dismount();
      }
      const target = objectAt(wx, wy);
      if (target && isNear(target, me.x, me.y)) {
        callbacks.current.onOpen(target);
        return;
      }
      const gear = target ? null : stationAt(wx, wy);
      if (gear && isNearStation(gear, me.x, me.y)) {
        grab(gear);
        return;
      }
      if (me.hang !== null) {
        const bx = barAt(wx, wy);
        if (bx === me.hang) return;
        dropBar();
      }
      const bar = target || gear ? null : barAt(wx, wy);
      if (bar !== null && nearbyBar(me.x, me.y) === bar && Math.abs(wx - me.x) < 48) {
        grabBar(bar);
        return;
      }
      const machine = target || gear ? null : machineAt(wx, wy);
      if (machine !== null && nearbyMachine(me.x, me.y) === machine) {
        mount(machine);
        return;
      }
      if (!target && !gear && machine === null) {
        const named = nameAt(wx, wy);
        if (named) flash = { text: named.name, x: named.x, y: named.y, until: performance.now() + 1800 };
      }
      pendingOpen = target;
      pendingGear = gear;
      pendingMachine = machine;
      pendingBar = bar;
      path = findPath(me.x, me.y, wx, bar !== null ? (bar + 1) * 32 + 16 : wy);
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        tapAt(e);
        return;
      }
      if (joy) return; // 두 번째 손가락은 무시
      canvas.setPointerCapture(e.pointerId);
      joy = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, active: false };
    };
    const onJoyMove = (e: PointerEvent) => {
      if (!joy || e.pointerId !== joy.id) return;
      joy.cx = e.clientX;
      joy.cy = e.clientY;
      if (!joy.active && Math.hypot(joy.cx - joy.sx, joy.cy - joy.sy) > 12) {
        joy.active = true;
        path = [];
        pendingOpen = null;
        pendingGear = null;
        pendingMachine = null;
        pendingBar = null;
        dismount();
      }
    };
    const onJoyEnd = (e: PointerEvent) => {
      if (!joy || e.pointerId !== joy.id) return;
      const wasTap = !joy.active && e.type === 'pointerup';
      joy = null;
      if (wasTap) tapAt(e);
    };
    const onHover = (e: PointerEvent) => {
      const { wx, wy } = toWorld(e);
      canvas.style.cursor = objectAt(wx, wy) || stationAt(wx, wy) ? 'pointer' : 'default';
    };
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointermove', onHover);
    canvas.addEventListener('pointermove', onJoyMove);
    canvas.addEventListener('pointerup', onJoyEnd);
    canvas.addEventListener('pointercancel', onJoyEnd);

    // ---- 실시간 (비공개 채널: 승인된 회원만 접속 가능)
    const presencePayload = () => ({
      nickname: me.nickname, avatar: me.avatar, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, pose: me.pose,
      hold: me.hold, ride: me.ride, hang: me.hang,
    });

    const syncPresence = () => {
      if (!channel) return;
      const state = channel.presenceState<Record<string, unknown>>();
      const ids = new Set(Object.keys(state));
      setOnline(Math.max(1, ids.size));
      for (const id of [...peers.keys()]) if (!ids.has(id)) peers.delete(id);
      for (const [id, metas] of Object.entries(state)) {
        if (id === me.id) continue;
        const meta = metas[metas.length - 1] as Record<string, unknown>;
        const pos = readPeer(meta);
        if (!pos) continue;
        const existing = peers.get(id);
        const nickname = cleanText(meta.nickname, 16) || '회원';
        const avatar = normalizeAvatar(meta.avatar as Partial<Avatar>);
        if (existing) {
          existing.nickname = nickname;
          existing.avatar = avatar;
          existing.hold = pos.hold;
          existing.ride = pos.ride;
          existing.hang = pos.hang;
        } else {
          peers.set(id, {
            id, nickname, avatar, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, dir: pos.dir,
            moving: false, pose: pos.pose, running: false, hold: pos.hold, ride: pos.ride, hang: pos.hang,
          });
        }
      }
    };

    // 새 채팅 (DB에 저장된 것만 실시간으로 받는다. 받는 사람에게도 RLS가 적용된다)
    const onChatInsert = (row: Record<string, unknown>) => {
      const id = String(row.id ?? '');
      const userId = String(row.user_id ?? '');
      const body = cleanText(row.body, 200);
      if (!UUID.test(id) || !UUID.test(userId) || !body) return;
      const speaker = userId === me.id ? me : peers.get(userId);
      if (speaker && userId !== me.id) bubble(speaker, body);
      callbacks.current.onChat?.({
        id, user_id: userId, body, created_at: String(row.created_at ?? new Date().toISOString()),
        nickname: speaker?.nickname ?? '회원',
      });
    };

    // 연결이 끊기면 점점 간격을 늘려가며 다시 연결한다 (2초 → 최대 30초)
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 2000;
    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    };

    const connect = async () => {
      if (disposed) return;
      if (channel) {
        const old = channel;
        channel = null;
        await supabase.removeChannel(old);
      }
      await supabase.realtime.setAuth();
      if (disposed) return;
      const ch = supabase.channel('box-space', {
        config: { private: true, presence: { key: me.id }, broadcast: { self: false } },
      });
      channel = ch;
      ch
        .on('presence', { event: 'sync' }, syncPresence)
        .on('broadcast', { event: 'move' }, ({ payload }) => {
          const p = peers.get(String(payload?.id));
          const pos = payload && readPeer(payload);
          if (!p || !pos) return;
          p.tx = pos.x;
          p.ty = pos.y;
          p.dir = pos.dir;
          p.moving = pos.moving;
          p.pose = pos.pose;
          p.running = pos.running;
          p.hold = pos.hold;
          p.ride = pos.ride;
          p.hang = pos.hang;
        })
        .on('broadcast', { event: 'act' }, ({ payload }) => {
          const p = peers.get(String(payload?.id));
          if (p && payload?.type === 'jump') p.jumpStart = performance.now();
          if (p && payload?.type === 'lift' && p.hold) p.liftStart = performance.now();
          if (p && payload?.type === 'pull' && p.hang !== null) p.pullStart = performance.now();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) =>
          onChatInsert(payload.new as Record<string, unknown>),
        )
        .subscribe(async (status, err) => {
          // 이미 교체되었거나 화면을 떠난 뒤의 오래된 채널 신호는 무시한다
          if (disposed || channel !== ch) return;
          if (status === 'SUBSCRIBED') {
            subscribed = true;
            retryDelay = 2000;
            setConnection('online');
            setConnError(null);
            await ch.track(presencePayload());
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            subscribed = false;
            setConnection('connecting');
            setConnError(`${status}${err?.message ? `: ${err.message.slice(0, 120)}` : ''}`);
            console.warn('[realtime]', status, err);
            scheduleReconnect();
          }
        });
    };
    connect();

    // 탭이 다시 보이면 끊겨 있던 연결을 바로 복구한다
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !subscribed && !retryTimer) connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    // ---- 게임 루프
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let vx = 0;
      let vy = 0;
      if (keys.has('left')) vx -= 1;
      if (keys.has('right')) vx += 1;
      if (keys.has('up')) vy -= 1;
      if (keys.has('down')) vy += 1;
      let joyRun = false;
      if (joy?.active && !vx && !vy) {
        const dx = joy.cx - joy.sx;
        const dy = joy.cy - joy.sy;
        const d = Math.hypot(dx, dy);
        if (d > 8) {
          vx = dx / d;
          vy = dy / d;
          joyRun = d > JOY_R * 0.85; // 끝까지 밀면 달리기
        }
      }
      if (me.ride !== null) {
        vx = 0;
        vy = 0;
        path = [];
      }
      // 철봉: 좌우로만 손을 옮기며 이동
      if (me.hang !== null) {
        path = [];
        if (joy?.active && Math.abs(joy.cy - joy.sy) > JOY_R * 0.9 && Math.abs(joy.cy - joy.sy) > Math.abs(joy.cx - joy.sx) * 1.5) {
          dropBar();
        } else {
          const hx = Math.sign(vx);
          me.moving = hx !== 0;
          if (hx) {
            me.x = Math.max(BAR_MIN_X, Math.min(BAR_MAX_X, me.x + hx * HANG_SPEED * dt));
            me.dir = hx > 0 ? 'right' : 'left';
          }
          vx = 0;
          vy = 0;
        }
      }
      if (!vx && !vy && path.length) {
        const target = path[0];
        const dx = target.x - me.x;
        const dy = target.y - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 3) path.shift();
        else {
          vx = dx / dist;
          vy = dy / dist;
        }
      }
      const len = Math.hypot(vx, vy);
      if (me.hang === null) me.moving = len > 0;
      me.running = me.moving && (keys.has('run') || runToggle || joyRun);
      if (me.moving && me.pose !== 'stand') {
        me.pose = 'stand'; // 움직이면 일어난다
        notify();
      }
      if (len > 0) {
        vx /= len;
        vy /= len;
        const speed = me.running ? RUN_SPEED : SPEED;
        const nx = me.x + vx * speed * dt;
        const ny = me.y + vy * speed * dt;
        const beforeX = me.x;
        const beforeY = me.y;
        // 벽에 닿으면 미끄러지듯 한 축만 이동
        if (!collides(nx, me.y)) me.x = nx;
        if (!collides(me.x, ny)) me.y = ny;
        // 완전히 막혔으면 길 따라가기를 멈춘다
        if (path.length && me.x === beforeX && me.y === beforeY) path = [];
        me.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      }

      // 위치 전송 (초당 최대 10회, 바뀌었을 때만)
      const sendKey = `${Math.round(me.x)},${Math.round(me.y)},${me.dir},${me.moving},${me.pose},${me.running},${me.hold},${me.ride},${me.hang}`;
      if (channel && subscribed && now - lastSent > 100 && sendKey !== lastSentKey) {
        lastSent = now;
        lastSentKey = sendKey;
        channel.send({
          type: 'broadcast', event: 'move',
          payload: {
            id: me.id, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir,
            moving: me.moving, pose: me.pose, running: me.running, hold: me.hold, ride: me.ride, hang: me.hang,
          },
        });
      }

      // 다른 회원은 부드럽게 따라가게
      for (const p of peers.values()) {
        if (p.ride !== null) {
          const seat = seatOf(p.ride);
          p.x = p.tx = seat.x;
          p.y = p.ty = seat.y;
          continue;
        }
        p.x += (p.tx - p.x) * Math.min(1, dt * 10);
        p.y += (p.ty - p.y) * Math.min(1, dt * 10);
      }

      const near = nearbyBoard(me.x, me.y);
      if (near !== currentNearby) {
        currentNearby = near;
        setNearby(near);
        callbacks.current.onNearbyChange?.(near);
      }
      const station = me.ride === null ? nearbyStation(me.x, me.y) : null;
      const machineNear = me.ride === null ? nearbyMachine(me.x, me.y) : null;
      const barNear = me.ride === null && me.hang === null ? nearbyBar(me.x, me.y) : null;
      if (station !== currentStation || machineNear !== currentMachine || barNear !== currentBar) {
        currentStation = station;
        currentMachine = machineNear;
        currentBar = barNear;
        setGearUi({ station, hold: me.hold, machine: machineNear, ride: me.ride, bar: barNear, hang: me.hang });
      }
      if (pendingBar !== null && !path.length) {
        if (nearbyBar(me.x, me.y) === pendingBar) grabBar(pendingBar);
        pendingBar = null;
      }
      if (pendingMachine !== null && !path.length) {
        if (nearbyMachine(me.x, me.y) === pendingMachine) mount(pendingMachine);
        pendingMachine = null;
      }
      if (pendingGear && !path.length) {
        if (isNearStation(pendingGear, me.x, me.y)) grab(pendingGear);
        pendingGear = null;
      }
      // 클릭한 오브젝트에 도착하면 연다
      if (pendingOpen && !path.length) {
        if (isNear(pendingOpen, me.x, me.y)) callbacks.current.onOpen(pendingOpen);
        pendingOpen = null;
      }

      // ---- 그리기
      const viewW = canvas.width / zoom;
      const viewH = canvas.height / zoom;
      cam = {
        x: viewW >= WORLD_W ? (WORLD_W - viewW) / 2 : Math.max(0, Math.min(WORLD_W - viewW, me.x - viewW / 2)),
        y: viewH >= WORLD_H ? (WORLD_H - viewH) / 2 : Math.max(0, Math.min(WORLD_H - viewH, me.y - viewH / 2)),
      };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#121214';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(zoom, 0, 0, zoom, -Math.round(cam.x * zoom), -Math.round(cam.y * zoom));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0);
      if (near) drawObjectHint(ctx, near, now);
      else if (station) drawStationHint(ctx, station, now);

      const everyone = [...peers.values(), me].sort((a, b) => a.y - b.y);
      const frame = (p: Player) =>
        p.pose === 'dance'
          ? Math.floor(now / 260) % 3
          : p.moving
            ? (Math.floor(now / (p.running ? 100 : 160)) % 2) + 1
            : 0;
      // 사람마다 이번 프레임의 점프 높이를 계산해 두고, 이름표·말풍선도 같은 높이만큼 올린다
      const lifts = new Map<string, number>();
      for (const p of everyone) {
        const j = jumpState(p.jumpStart ? now - p.jumpStart : JUMP_MS);
        const bounce = p.pose === 'dance' && !j.air ? Math.abs(Math.sin(now / 130)) * 3 : 0;
        const lift = j.lift + bounce;
        lifts.set(p.id, lift);
        const liftT = p.liftStart ? now - p.liftStart : LIFT_MS;
        const lifting = p.hold !== null && liftT < LIFT_MS;
        const dir = p.pose === 'dance' ? 'down' : p.dir;
        const side = dir === 'left' || dir === 'right';
        // 손 위치: 평소엔 허리 높이, 들어올리면 머리 위
        const up = lifting ? Math.sin((Math.PI * liftT) / LIFT_MS) : 0;
        const handY = p.y - lift - 14 * SPRITE_SCALE - up * 22 * SPRITE_SCALE;
        const handX = p.x + (side ? (dir === 'right' ? 9 : -9) : 0);
        if (lifting) lifts.set(p.id, lift + up * 16); // 머리 위 기구가 이름표를 가리지 않게
        if (p.ride !== null) {
          drawRider(ctx, p, now);
          continue;
        }
        if (p.hang !== null) {
          const pt = p.pullStart ? now - p.pullStart : PULL_MS;
          const pull = pt < PULL_MS ? Math.sin((Math.PI * pt) / PULL_MS) : 0;
          const sway = p.moving ? Math.sin(now / 120) * 2 : Math.sin(now / 600) * 0.8;
          const hangLift = 10 + pull * 14;
          lifts.set(p.id, hangLift);
          drawAvatar(ctx, p.avatar, p.x + sway, p.y, 'down', 0, SPRITE_SCALE, 'air', hangLift, 1 + pull * 0.04);
          continue;
        }
        if (p.hold && dir === 'up') drawGear(ctx, p.hold, handX, handY, side);
        drawAvatar(
          ctx, p.avatar, p.x, p.y, dir,
          j.air || lifting ? 0 : frame(p), SPRITE_SCALE, j.air || up > 0.35 ? 'air' : p.pose, lift, j.squash,
        );
        if (p.hold && dir !== 'up') drawGear(ctx, p.hold, handX, handY, side);
      }

      // 이름표와 말풍선
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of everyone) {
        const headY = p.y - (lifts.get(p.id) ?? 0) - SPRITE_H * SPRITE_SCALE - 6;
        ctx.font = 'bold 10px system-ui, "Malgun Gothic", sans-serif';
        const w = ctx.measureText(p.nickname).width + 10;
        ctx.fillStyle = p.id === me.id ? 'rgba(122,46,58,0.92)' : 'rgba(20,20,22,0.75)';
        ctx.fillRect(p.x - w / 2, headY - 7, w, 14);
        ctx.fillStyle = p.id === me.id ? '#FFE27A' : '#FFFFFF';
        ctx.fillText(p.nickname, p.x, headY);

        if (p.chat && p.chatUntil && p.chatUntil > now) {
          ctx.font = '11px system-ui, "Malgun Gothic", sans-serif';
          const tw = Math.min(180, ctx.measureText(p.chat).width) + 14;
          const by = headY - 24;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#2A2320';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(p.x - tw / 2, by - 10, tw, 20, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#1F1F22';
          ctx.fillText(p.chat, p.x, by, 180);
        }
      }

      // 플로팅 조이스틱 (화면 좌표로 그린다)
      if (joy?.active) {
        const r = canvas.getBoundingClientRect();
        const k = canvas.width / r.width;
        const bx = (joy.sx - r.left) * k;
        const by = (joy.sy - r.top) * k;
        const dx = joy.cx - joy.sx;
        const dy = joy.cy - joy.sy;
        const d = Math.hypot(dx, dy);
        const m = Math.min(1, JOY_R / Math.max(d, 1));
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.arc(bx, by, JOY_R * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = d > JOY_R * 0.85 ? 'rgba(232,185,35,0.9)' : 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(bx + dx * m * k, by + dy * m * k, 20 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 누른 구조물 이름 잠깐 보여주기
      if (flash && flash.until > now) {
        ctx.font = 'bold 11px system-ui, "Malgun Gothic", sans-serif';
        const fw = ctx.measureText(flash.text).width + 14;
        const fy = Math.max(12, flash.y - 12);
        ctx.globalAlpha = Math.min(1, (flash.until - now) / 300);
        ctx.fillStyle = 'rgba(20,20,22,0.85)';
        ctx.beginPath();
        ctx.roundRect(flash.x - fw / 2, fy - 10, fw, 20, 6);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(flash.text, flash.x, fy + 1);
        ctx.globalAlpha = 1;
      } else flash = null;

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // 위치 기억 (게시판에 갔다가 돌아오면 같은 자리에서 시작)
    const savePos = () => {
      try {
        sessionStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(me.x), y: Math.round(me.y) }));
      } catch {}
    };
    const saveTimer = setInterval(savePos, 2000);
    // 늦게 들어온 회원도 현재 위치를 보게 presence를 가끔 갱신
    const presenceTimer = setInterval(() => subscribed && channel?.track(presencePayload()), 5000);

    return () => {
      disposed = true;
      savePos();
      cancelAnimationFrame(raf);
      clearInterval(saveTimer);
      clearInterval(presenceTimer);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('pointermove', onHover);
      canvas.removeEventListener('pointermove', onJoyMove);
      canvas.removeEventListener('pointerup', onJoyEnd);
      canvas.removeEventListener('pointercancel', onJoyEnd);
      if (handleRef) handleRef.current = null;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (channel) supabase.removeChannel(channel);
    };
    // 캐릭터는 내용(avatarKey)이 바뀔 때만 다시 연결한다 (같은 내용의 새 객체로는 재연결하지 않음)
  }, [profile.id, profile.nickname, avatarKey, handleRef]);

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none select-none overflow-hidden">
      <canvas ref={canvasRef} className="block" aria-label="크로스핏051 박스 2D 공간" />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/60 px-2.5 py-1 text-xs text-white">
        <span
          className={`h-2 w-2 rounded-full ${connection === 'online' ? 'bg-green-400' : connection === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`}
        />
        {connection === 'online'
          ? `접속 중 ${online}명`
          : connection === 'connecting'
            ? '실시간 연결 중…'
            : `실시간 연결 끊김${connError ? ` (${connError})` : ''}`}
      </div>
      {!nearby && (gearUi.ride !== null || (gearUi.machine !== null && !gearUi.station && !gearUi.hold)) && (
        <button
          type="button"
          onClick={() => rideRef.current()}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border-2 border-[#2A2320] bg-white px-4 py-2 text-sm font-bold text-[#2A2320] shadow-[0_3px_0_#2A2320] active:translate-y-0.5"
        >
          {gearUi.ride !== null
            ? `${MACHINE_INFO[MACHINES[gearUi.ride].kind].icon} 내리기`
            : `${MACHINE_INFO[MACHINES[gearUi.machine!].kind].icon} ${MACHINE_INFO[MACHINES[gearUi.machine!].kind].label} 타기`}{' '}
          <span className="hidden sm:inline">(E)</span>
        </button>
      )}
      {!nearby && gearUi.ride === null && !gearUi.station && !gearUi.hold && gearUi.machine === null && (gearUi.hang !== null || gearUi.bar !== null) && (
        <button
          type="button"
          onClick={() => hangRef.current()}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border-2 border-[#2A2320] bg-white px-4 py-2 text-sm font-bold text-[#2A2320] shadow-[0_3px_0_#2A2320] active:translate-y-0.5"
        >
          {gearUi.hang !== null ? '🤸 철봉에서 내려오기' : '🤸 철봉 매달리기'} <span className="hidden sm:inline">(E)</span>
        </button>
      )}
      {!nearby && gearUi.ride === null && (gearUi.station || gearUi.hold) && (
        <button
          type="button"
          onClick={() => grabRef.current()}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border-2 border-[#2A2320] bg-white px-4 py-2 text-sm font-bold text-[#2A2320] shadow-[0_3px_0_#2A2320] active:translate-y-0.5"
        >
          {gearUi.hold && (!gearUi.station || gearUi.station === gearUi.hold)
            ? `${GEAR[gearUi.hold].icon} ${GEAR[gearUi.hold].label} 내려놓기`
            : `${GEAR[gearUi.station!].icon} ${GEAR[gearUi.station!].label} 들기`}{' '}
          <span className="hidden sm:inline">(E)</span>
        </button>
      )}
      {nearby && (
        <button
          type="button"
          onClick={() => onOpen(nearby)}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border-2 border-[#2A2320] bg-[#E8B923] px-4 py-2 text-sm font-bold text-[#2A2320] shadow-[0_3px_0_#2A2320] active:translate-y-0.5"
        >
          {OBJECT_LABELS[nearby]} 열기{' '}
          <span className="hidden sm:inline">(E · 클릭)</span>
        </button>
      )}
    </div>
  );
}

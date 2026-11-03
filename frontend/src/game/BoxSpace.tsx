'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { normalizeAvatar, type Avatar } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { drawAvatar, type Dir } from './avatar';
import {
  BOARDS, SPAWN, WORLD_H, WORLD_W, collides, drawObjectHint, drawStaticMap, findPath, nearbyBoard, type BoardKey,
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
  chat?: string;
  chatUntil?: number;
};

const SPEED = 150; // 초당 이동 픽셀
const SPRITE_SCALE = 2;
const CHAT_MAX = 60;
const POS_KEY = 'box-space-pos';
const DIRS: Dir[] = ['down', 'up', 'left', 'right'];

function clampNum(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null;
}

// 다른 회원이 보낸 데이터는 그대로 믿지 않고 형식과 범위를 검사한다
function readPeer(raw: Record<string, unknown>) {
  const x = clampNum(raw.x, 0, WORLD_W);
  const y = clampNum(raw.y, 0, WORLD_H);
  if (x === null || y === null) return null;
  const dir = DIRS.includes(raw.dir as Dir) ? (raw.dir as Dir) : 'down';
  return { x, y, dir, moving: raw.moving === true };
}

function cleanText(v: unknown, max: number) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
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
  onOpenBoard,
  chatRef,
}: {
  profile: Profile;
  onOpenBoard: (board: BoardKey) => void;
  chatRef: React.RefObject<((text: string) => void) | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState<BoardKey | null>(null);
  const [online, setOnline] = useState(1);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [connError, setConnError] = useState<string | null>(null);
  const avatarKey = JSON.stringify(normalizeAvatar(profile.avatar));
  const openRef = useRef(onOpenBoard);
  useEffect(() => {
    openRef.current = onOpenBoard;
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
      x: start.x, y: start.y, tx: start.x, ty: start.y, dir: 'up', moving: false,
    };
    const peers = new Map<string, Player>();
    const keys = new Set<string>();
    let path: { x: number; y: number }[] = [];
    let zoom = 1.5;
    let cam = { x: 0, y: 0 };
    let raf = 0;
    let last = performance.now();
    let lastSent = 0;
    let lastSentKey = '';
    let lastChat = 0;
    let currentNearby: BoardKey | null = null;
    let channel: RealtimeChannel | null = null;
    let subscribed = false; // 채널 연결이 끝난 뒤에만 보낸다
    let disposed = false;

    // ---- 화면 크기
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      zoom = (width < 640 ? 1.3 : 1.6) * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- 키보드
    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        keys.add(k);
        path = [];
        e.preventDefault();
      }
      if ((k === ' ' || k === 'e' || k === 'enter') && currentNearby) {
        e.preventDefault();
        openRef.current(currentNearby);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ---- 탭/클릭해서 이동
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      const wx = ((e.clientX - r.left) * dpr) / zoom + cam.x;
      const wy = ((e.clientY - r.top) * dpr) / zoom + cam.y;
      path = findPath(me.x, me.y, wx, wy);
    };
    canvas.addEventListener('pointerdown', onPointer);

    // ---- 실시간 (비공개 채널: 승인된 회원만 접속 가능)
    const presencePayload = () => ({
      nickname: me.nickname, avatar: me.avatar, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir,
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
        } else {
          peers.set(id, { id, nickname, avatar, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, dir: pos.dir, moving: false });
        }
      }
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
        })
        .on('broadcast', { event: 'chat' }, ({ payload }) => {
          const p = peers.get(String(payload?.id));
          const text = cleanText(payload?.text, CHAT_MAX);
          if (!p || !text) return;
          p.chat = text;
          p.chatUntil = performance.now() + 6000;
        })
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

    chatRef.current = (raw: string) => {
      const text = cleanText(raw, CHAT_MAX);
      const now = performance.now();
      if (!text || now - lastChat < 1500) return;
      lastChat = now;
      me.chat = text;
      me.chatUntil = now + 6000;
      if (subscribed) channel?.send({ type: 'broadcast', event: 'chat', payload: { id: me.id, text } });
    };

    // ---- 게임 루프
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let vx = 0;
      let vy = 0;
      if (keys.has('arrowleft') || keys.has('a')) vx -= 1;
      if (keys.has('arrowright') || keys.has('d')) vx += 1;
      if (keys.has('arrowup') || keys.has('w')) vy -= 1;
      if (keys.has('arrowdown') || keys.has('s')) vy += 1;
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
      me.moving = len > 0;
      if (len > 0) {
        vx /= len;
        vy /= len;
        const nx = me.x + vx * SPEED * dt;
        const ny = me.y + vy * SPEED * dt;
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
      const sendKey = `${Math.round(me.x)},${Math.round(me.y)},${me.dir},${me.moving}`;
      if (channel && subscribed && now - lastSent > 100 && sendKey !== lastSentKey) {
        lastSent = now;
        lastSentKey = sendKey;
        channel.send({
          type: 'broadcast', event: 'move',
          payload: { id: me.id, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: me.moving },
        });
      }

      // 다른 회원은 부드럽게 따라가게
      for (const p of peers.values()) {
        p.x += (p.tx - p.x) * Math.min(1, dt * 10);
        p.y += (p.ty - p.y) * Math.min(1, dt * 10);
      }

      const near = nearbyBoard(me.x, me.y);
      if (near !== currentNearby) {
        currentNearby = near;
        setNearby(near);
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

      const everyone = [...peers.values(), me].sort((a, b) => a.y - b.y);
      const frame = (p: Player) => (p.moving ? (Math.floor(now / 160) % 2) + 1 : 0);
      for (const p of everyone) drawAvatar(ctx, p.avatar, p.x, p.y, p.dir, frame(p), SPRITE_SCALE);

      // 이름표와 말풍선
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of everyone) {
        const headY = p.y - 22 * SPRITE_SCALE - 6;
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
      chatRef.current = null;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (channel) supabase.removeChannel(channel);
    };
    // 캐릭터는 내용(avatarKey)이 바뀔 때만 다시 연결한다 (같은 내용의 새 객체로는 재연결하지 않음)
  }, [profile.id, profile.nickname, avatarKey, chatRef]);

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
      {nearby && (
        <button
          type="button"
          onClick={() => onOpenBoard(nearby)}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border-2 border-[#2A2320] bg-[#E8B923] px-4 py-2 text-sm font-bold text-[#2A2320] shadow-[0_3px_0_#2A2320] active:translate-y-0.5"
        >
          {BOARDS[nearby].label} 열기 <span className="hidden sm:inline">(Space)</span>
        </button>
      )}
    </div>
  );
}

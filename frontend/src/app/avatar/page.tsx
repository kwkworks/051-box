'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { AvatarView } from '@/components/AvatarView';
import { BoardShell } from '@/components/BoardShell';
import { Guard } from '@/components/Guard';
import type { Dir } from '@/game/avatar';
import { api } from '@/lib/api';
import {
  AVATAR_LABELS, AVATAR_OPTIONS, COLORS, OPTION_LABELS, normalizeAvatar, type Avatar,
} from '@/lib/constants';
import type { Me, Profile } from '@/lib/types';

export default function AvatarPage() {
  return <Guard need="login">{(me) => <Editor me={me} />}</Guard>;
}

const COLOR_SOURCE: Partial<Record<keyof Avatar, Record<string, string>>> = {
  skin: COLORS.skin,
  hairColor: COLORS.hair,
  topColor: COLORS.cloth,
  bottomColor: COLORS.cloth,
  shoes: COLORS.cloth,
};

function Editor({ me }: { me: Me }) {
  const router = useRouter();
  const { setMe } = useAuth();
  const [avatar, setAvatar] = useState<Avatar>(normalizeAvatar(me.profile.avatar));
  const [nickname, setNickname] = useState(me.profile.nickname);
  const [dir, setDir] = useState<Dir>('down');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nickValid = /^[0-9A-Za-z가-힣 _.-]{2,16}$/.test(nickname.trim());

  const randomize = () => {
    const next = { ...avatar };
    for (const key of Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[]) {
      const opts = AVATAR_OPTIONS[key];
      (next as Record<string, string>)[key] = opts[Math.floor(Math.random() * opts.length)];
    }
    setAvatar(next);
  };

  const save = async () => {
    if (!nickValid) return;
    setSaving(true);
    setError(null);
    try {
      const { profile } = await api.patch<{ profile: Profile }>('/me', { nickname: nickname.trim(), avatar });
      setMe((prev) => (prev ? { ...prev, profile: { ...prev.profile, ...profile } } : prev));
      router.push(me.profile.role === 'pending' ? '/pending' : '/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BoardShell title="캐릭터 꾸미기" subtitle="박스 안에서 보이는 내 모습">
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <section className="card flex flex-col items-center gap-3 p-4 md:sticky md:top-24 md:self-start">
          <div className="flex h-56 w-full items-center justify-center rounded-md bg-[var(--mat)]">
            <AvatarView avatar={avatar} scale={7} dir={dir} animate />
          </div>
          <div className="flex gap-1">
            {(['down', 'left', 'up', 'right'] as Dir[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${dir === d ? 'btn-primary' : ''}`}
                onClick={() => setDir(d)}
                aria-label={`${d} 방향 보기`}
              >
                {{ down: '앞', left: '왼', up: '뒤', right: '오' }[d]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm w-full" onClick={randomize}>
            🎲 랜덤
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <div className="card p-4">
            <label className="label" htmlFor="nickname">
              닉네임 (2~16자, 한글·영문·숫자)
            </label>
            <input
              id="nickname"
              className="input"
              value={nickname}
              maxLength={16}
              onChange={(e) => setNickname(e.target.value)}
            />
            {!nickValid && <p className="mt-1 text-xs font-bold text-[var(--danger)]">2~16자의 한글, 영문, 숫자로 입력해주세요</p>}
          </div>

          {(Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[]).map((key) => {
            const colors = COLOR_SOURCE[key];
            return (
              <div key={key} className="card p-4">
                <p className="label">{AVATAR_LABELS[key]}</p>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS[key].map((value) => {
                    const selected = avatar[key] === value;
                    if (colors) {
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-label={`${AVATAR_LABELS[key]} ${value}`}
                          aria-pressed={selected}
                          onClick={() => setAvatar({ ...avatar, [key]: value })}
                          className={`h-9 w-9 rounded-md border-2 ${selected ? 'border-ink ring-4 ring-yellow' : 'border-ink/30'}`}
                          style={{ background: colors[value] }}
                        />
                      );
                    }
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setAvatar({ ...avatar, [key]: value })}
                        className={`btn btn-sm ${selected ? 'btn-primary' : ''}`}
                      >
                        {OPTION_LABELS[value] ?? value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {error && <p className="font-bold text-[var(--danger)]">{error}</p>}
          <button type="button" className="btn btn-dark h-12" disabled={saving || !nickValid} onClick={save}>
            {saving ? '저장 중…' : '저장하고 박스로'}
          </button>
        </section>
      </div>
    </BoardShell>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AvatarView } from '@/components/AvatarView';
import { useAuth } from '@/components/AuthProvider';
import { wakeServer } from '@/lib/api';
import { isConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';

type Provider = 'kakao' | 'google';

export default function LoginPage() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wakeServer(); // 로그인하는 동안 백엔드 서버를 미리 깨운다
  }, []);

  useEffect(() => {
    if (ready && session) router.replace('/');
  }, [ready, session, router]);

  const login = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // 카카오는 이메일 없이 닉네임, 프로필 사진만 요청
        ...(provider === 'kakao' ? { scopes: 'profile_nickname profile_image' } : {}),
      },
    });
    if (err) {
      setError('로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.');
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--mat)]">
      <div className="h-3 bg-[var(--burgundy)]" />
      <div className="h-1.5 bg-yellow" />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-yellow bg-[#1b1b1e] text-white">
            <span className="text-[10px] font-bold tracking-widest text-yellow">CROSSFIT</span>
            <span className="text-3xl font-black leading-none">051</span>
          </div>
          <h1 className="text-2xl font-black">051 BOX</h1>
          <p className="mt-1 text-sm text-muted">크로스핏051 회원 전용 커뮤니티</p>

          <div className="my-5 flex justify-center gap-1">
            <AvatarView scale={2} animate avatar={{ topColor: 'burgundy', hair: 'short', head: 'cap', gear: 'belt' }} />
            <AvatarView scale={2} animate dir="left" avatar={{ topColor: 'yellow', hair: 'ponytail', hairColor: 'brown', skin: 's1', eyes: 'smile', bottom: 'leggings' }} />
            <AvatarView scale={2} animate dir="right" avatar={{ topColor: 'black', hair: 'buzz', head: 'headband', gear: 'wristwraps', skin: 's3' }} />
          </div>

          {!isConfigured && (
            <p className="mb-4 rounded-md bg-yellow/30 p-2 text-xs font-bold">
              Supabase 환경변수가 설정되지 않았어요. frontend/.env.local을 확인하세요.
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="btn h-12 w-full"
              style={{ background: '#FEE500' }}
              disabled={!!busy || !isConfigured}
              onClick={() => login('kakao')}
            >
              {busy === 'kakao' ? '카카오로 이동 중…' : '카카오로 시작하기'}
            </button>
            <button
              type="button"
              className="btn h-12 w-full"
              disabled={!!busy || !isConfigured}
              onClick={() => login('google')}
            >
              {busy === 'google' ? '구글로 이동 중…' : 'Google로 시작하기'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm font-bold text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted">
            처음 가입하면 관리자 승인 후 이용할 수 있어요.
            <br />
            비밀번호는 저장하지 않으며, 닉네임과 캐릭터 정보만 보관해요.
          </p>
          <Link href="/privacy" className="mt-2 inline-block text-xs font-bold text-muted underline">
            개인정보처리방침
          </Link>
        </div>
      </main>
    </div>
  );
}

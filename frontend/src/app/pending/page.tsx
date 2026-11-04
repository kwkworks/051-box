'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AvatarView } from '@/components/AvatarView';
import { useAuth } from '@/components/AuthProvider';
import { Guard } from '@/components/Guard';

export default function PendingPage() {
  return <Guard need="login">{(me) => <Pending nickname={me.profile.nickname} role={me.profile.role} avatar={me.profile.avatar} />}</Guard>;
}

function Pending({ nickname, role, avatar }: { nickname: string; role: string; avatar: object }) {
  const { refreshMe, signOut } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setStatus(null);
    const next = await refreshMe();
    setChecking(false);
    if (!next) setStatus('확인하지 못했어요. 잠시 후 다시 눌러주세요.');
    else if (next.profile.role === 'pending') setStatus('아직 승인 전이에요. 코치님께 승인을 요청해주세요.');
    else setStatus('승인됐어요! 박스로 이동할게요.');
  };

  useEffect(() => {
    if (role !== 'pending') router.replace('/');
  }, [role, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--mat)] px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="flex justify-center">
          <AvatarView avatar={avatar} scale={4} animate />
        </div>
        <h1 className="mt-2 text-xl font-black">{nickname}님, 환영해요!</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          관리자(코치)가 가입을 승인하면 박스에 입장할 수 있어요.
          <br />
          기다리는 동안 캐릭터를 꾸며보세요.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/avatar" className="btn btn-primary">
            캐릭터 꾸미기
          </Link>
          <button type="button" className="btn" disabled={checking} onClick={check}>
            {checking ? '확인하는 중…' : '승인됐는지 확인하기'}
          </button>
          {status && (
            <p className="text-sm font-bold" role="status">
              {status}
            </p>
          )}
          <button type="button" className="btn btn-sm mt-2 border-transparent shadow-none" onClick={() => signOut()}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

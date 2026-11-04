'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AvatarView } from '@/components/AvatarView';
import { useAuth } from '@/components/AuthProvider';
import { Guard } from '@/components/Guard';
import { api } from '@/lib/api';

export default function PendingPage() {
  return <Guard need="login">{(me) => <Pending nickname={me.profile.nickname} role={me.profile.role} avatar={me.profile.avatar} />}</Guard>;
}

function Pending({ nickname, role, avatar }: { nickname: string; role: string; avatar: object }) {
  const { refreshMe, signOut } = useAuth();
  const rejected = role === 'rejected';
  const [applying, setApplying] = useState(false);

  // 거절된 사람: 다시 신청 (승인 대기로)
  const reapply = async () => {
    setApplying(true);
    setStatus(null);
    try {
      await api.post('/me/reapply');
      await refreshMe(); // 내 정보(승인 대기 상태)를 다시 불러온다
      setStatus('다시 신청했어요. 관리자가 승인하면 입장할 수 있어요.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : '신청하지 못했어요');
    } finally {
      setApplying(false);
    }
  };
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
    else if (next.profile.role === 'rejected') setStatus('가입 신청이 거절됐어요. 아래에서 다시 신청할 수 있어요.');
    else setStatus('승인됐어요! 박스로 이동할게요.');
  };

  useEffect(() => {
    if (role === 'member' || role === 'admin') router.replace('/');
  }, [role, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--mat)] px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="flex justify-center">
          <AvatarView avatar={avatar} scale={4} animate />
        </div>
        <h1 className="mt-2 text-xl font-black">{rejected ? `${nickname}님, 가입이 거절됐어요` : `${nickname}님, 환영해요!`}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {rejected ? (
            <>
              크로스핏051 회원이 맞다면 닉네임을 실제 이름으로 바꾼 뒤
              <br />
              다시 신청하거나 코치님께 말씀해 주세요.
            </>
          ) : (
            <>
              관리자(코치)가 가입을 승인하면 박스에 입장할 수 있어요.
              <br />
              기다리는 동안 캐릭터를 꾸며보세요.
            </>
          )}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {rejected && (
            <button type="button" className="btn btn-primary" disabled={applying} onClick={reapply}>
              {applying ? '신청하는 중…' : '🙋 다시 가입 신청하기'}
            </button>
          )}
          <Link href="/avatar" className={`btn ${rejected ? '' : 'btn-primary'}`}>
            {rejected ? '닉네임·캐릭터 바꾸기' : '캐릭터 꾸미기'}
          </Link>
          {!rejected && (
            <button type="button" className="btn" disabled={checking} onClick={check}>
              {checking ? '확인하는 중…' : '승인됐는지 확인하기'}
            </button>
          )}
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

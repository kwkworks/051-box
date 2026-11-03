'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loading } from '@/components/Guard';
import { supabase } from '@/lib/supabase';

// 소셜 로그인 후 돌아오는 곳. supabase-js가 주소의 code를 세션으로 바꾼다(PKCE).
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Loading text="로그인하는 중이에요…" />}>
      <Callback />
    </Suspense>
  );
}

function Callback() {
  const router = useRouter();
  const providerError = useSearchParams().get('error');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (providerError) return;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.replace('/'); // 항상 내부 경로로만 이동 (오픈 리다이렉트 방지)
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go();
    });
    supabase.auth.getSession().then(({ data }) => data.session && go());
    const timeout = setTimeout(() => !done && setTimedOut(true), 15000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, providerError]);

  if (providerError || timedOut) {
    return (
      <div className="mx-auto mt-24 max-w-sm px-4 text-center">
        <p className="mb-4 font-bold">
          {providerError ? '로그인이 취소되었거나 실패했어요.' : '로그인 확인이 오래 걸리고 있어요. 다시 시도해주세요.'}
        </p>
        <Link href="/login" className="btn btn-primary">
          로그인으로 돌아가기
        </Link>
      </div>
    );
  }
  return <Loading text="로그인하는 중이에요…" />;
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

// 누르면 다른 화면으로 가는 카드. 링크(<a>) 대신 쓰는 이유:
// 갤럭시 등 휴대폰 다크 모드가 '가 본 링크'의 글자를 회색으로 바꾸는데, 링크가 아니면 그런 상태가 없다.
// 키보드(Enter)로도 열리고, 화면 낭독기에는 링크로 읽힌다. 이동할 화면은 미리 받아 둔다.
export function NavCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);
  const go = () => router.push(href);
  return (
    <div
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className ?? ''}`}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </div>
  );
}

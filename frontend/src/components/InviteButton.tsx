'use client';

import { useState } from 'react';

const INVITE_TEXT = '크로스핏051 회원 커뮤니티 051 BOX에 초대해요! 카카오 또는 구글로 가입하면, 관리자 승인 후 WOD·모임·1RM 기록을 함께 볼 수 있어요.';

// 초대하기: 휴대폰은 공유 창(카카오톡·문자 등), 지원하지 않으면 초대 문구와 주소를 복사한다.
// 링크는 항상 이 사이트의 주소만 쓰고, 가입해도 관리자 승인이 필요하다 (승인 절차는 그대로).
export function InviteButton({ className = 'btn', compact = false }: { className?: string; compact?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);

  const invite = async () => {
    const url = `${window.location.origin}/login`;
    try {
      if (navigator.share) {
        await navigator.share({ title: '051 BOX 초대', text: INVITE_TEXT, url });
        return;
      }
      await navigator.clipboard.writeText(`${INVITE_TEXT}\n${url}`);
      setStatus('초대 문구를 복사했어요. 카카오톡에 붙여넣어 보내주세요!');
    } catch (e) {
      // 공유 창을 그냥 닫은 경우는 조용히 넘어간다
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setStatus('공유하지 못했어요. 주소를 직접 알려주세요: ' + url);
    }
    setTimeout(() => setStatus(null), 4000);
  };

  return (
    <>
      <button type="button" className={className} onClick={invite}>
        📨 {compact ? '초대하기' : '박스 회원 초대하기'}
      </button>
      {status && (
        <p className="mt-2 text-sm font-bold text-[var(--burgundy)]" role="status">
          {status}
        </p>
      )}
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 051 BOX',
};

// 로그인 없이 누구나 볼 수 있는 페이지 (소셜 로그인 동의 화면에서 링크됨)
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b-2 border-ink bg-[var(--burgundy)] text-white">
        <div className="h-1.5 bg-yellow" />
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link href="/login" className="btn btn-sm">← 051 BOX</Link>
          <h1 className="text-lg font-extrabold">개인정보처리방침</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <article className="card space-y-5 p-5 text-[15px] leading-relaxed">
          <p>
            크로스핏051(이하 &quot;박스&quot;)은 회원 전용 커뮤니티 &quot;051 BOX&quot;(이하 &quot;서비스&quot;)를 운영하며,
            서비스 이용에 꼭 필요한 최소한의 정보만 처리합니다.
          </p>

          <section>
            <h2 className="mb-1 font-black">1. 처리하는 정보</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>소셜 로그인 정보: 카카오 또는 구글 계정 식별자, 닉네임, 프로필 사진</li>
              <li>이메일 주소(선택): 로그인 시스템 내부에만 저장되며, 서비스 화면에 표시하거나 다른 용도로 사용하지 않습니다.</li>
              <li>서비스 이용 기록: 서비스 닉네임, 캐릭터 설정, 출석 기록, 1RM 기록, 대회·모임 참가 신청 내역</li>
              <li>비밀번호는 저장하지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-1 font-black">2. 이용 목적</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>박스 회원 확인과 가입 승인</li>
              <li>WOD, 공지, 대회·모임 신청, 1RM 기록 등 커뮤니티 기능 제공</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-1 font-black">3. 공개 범위</h2>
            <p>
              닉네임, 캐릭터, 1RM 순위, 참가자 명단, PR 축하 글은 관리자 승인을 받은 박스 회원에게만 보입니다.
              2D 공간의 위치와 말풍선은 접속 중인 회원에게만 실시간으로 전달되며 저장하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-black">4. 보관 기간과 삭제</h2>
            <p>
              회원 탈퇴를 요청하면 지체 없이 계정과 이용 기록을 삭제합니다. 탈퇴와 정보 열람·정정·삭제 요청은 박스 데스크(관리자)에 문의해주세요.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-black">5. 처리 위탁</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Supabase: 데이터베이스, 로그인, 사진 저장</li>
              <li>Vercel, Render: 서비스 화면과 서버 운영</li>
              <li>카카오, Google: 소셜 로그인</li>
            </ul>
          </section>

          <p className="text-sm text-muted">시행일: 2026년 11월 3일</p>
        </article>
      </main>
    </div>
  );
}

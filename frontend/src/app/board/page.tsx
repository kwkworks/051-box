'use client';

import Link from 'next/link';
import { BoardShell } from '@/components/BoardShell';
import { Guard } from '@/components/Guard';
import { InstallHint } from '@/components/InstallHint';
import { InviteButton } from '@/components/InviteButton';
import { NotificationSettings } from '@/components/NotificationSettings';
import { BOARDS, type BoardKey } from '@/game/map';
import { formatDateLabel } from '@/lib/format';
import type { Me } from '@/lib/types';

export default function BoardHubPage() {
  return <Guard need="member">{(me) => <Hub me={me} />}</Guard>;
}

const ORDER: BoardKey[] = ['wod', 'notices', 'competition', 'gathering', 'one-rm', 'wall'];

// 모든 기능을 이름과 설명으로 한눈에 모아둔 게시판
function Hub({ me }: { me: Me }) {
  const extras = [
    { href: '/avatar', icon: '👕', label: '캐릭터 꾸미기', hint: '내 캐릭터 모습과 닉네임' },
    { href: '/', icon: '🏠', label: '박스 공간', hint: '2D 박스로 돌아가서 회원들과 만나기 · 출석 체크 · 채팅 · 배경음악' },
    ...(me.profile.role === 'admin'
      ? [{ href: '/admin', icon: '🔑', label: '관리자', hint: '가입 승인, 휴무일, 구글 시트 WOD 가져오기' }]
      : []),
  ];

  return (
    <BoardShell title="🗂 게시판" subtitle="모든 기능을 한눈에">
      <section className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <p className="text-sm font-bold">{me.today ? formatDateLabel(me.today) : '오늘'}</p>
        <span className="chip">🔥 연속 출석 {me.streak}일</span>
        <span className={`chip ${me.checkedInToday ? 'border-[var(--ok)] text-[var(--ok)]' : ''}`}>
          {me.checkedInToday ? '✓ 오늘 출석 완료' : '오늘 출석 전 (박스 공간에서 출석 체크)'}
        </span>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2">
        {ORDER.map((key) => {
          const b = BOARDS[key];
          return (
            <li key={key}>
              <Link href={b.href} className="card flex h-full items-center gap-4 p-4 transition-transform hover:-translate-y-0.5">
                <span className="text-3xl" aria-hidden>{b.icon}</span>
                <span>
                  <span className="block text-lg font-black">{b.label}</span>
                  <span className="block text-sm text-muted">{b.hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-2 mt-6 text-sm font-black text-muted">그 밖의 메뉴</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {extras.map((x) => (
          <li key={x.href}>
            <Link href={x.href} className="card flex h-full items-center gap-4 p-4 transition-transform hover:-translate-y-0.5">
              <span className="text-3xl" aria-hidden>{x.icon}</span>
              <span>
                <span className="block text-lg font-black">{x.label}</span>
                <span className="block text-sm text-muted">{x.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="card mt-6 flex flex-col gap-2 p-4">
        <h2 className="font-black">📨 박스 회원 초대하기</h2>
        <p className="text-sm text-muted">카카오톡 등으로 051 BOX 주소를 보내요. 가입한 사람은 관리자 승인 후 이용할 수 있어요.</p>
        <InviteButton className="btn btn-primary h-12 text-base" />
      </section>
      <NotificationSettings profile={me.profile} />
      <InstallHint />
    </BoardShell>
  );
}

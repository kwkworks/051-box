'use client';

import { useState } from 'react';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { NoticeEditor } from '@/components/NoticeEditor';
import { api } from '@/lib/api';
import { formatRelative, safeHttpsUrl } from '@/lib/format';
import type { Me, Notice } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function NoticesPage() {
  return <Guard need="member">{(me) => <Notices me={me} />}</Guard>;
}

function Notices({ me }: { me: Me }) {
  const isAdmin = me.profile.role === 'admin';
  const { data, error, loading, reload } = useLoad(() => api.get<{ notices: Notice[] }>('/notices'), 'notices');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Notice | 'new' | null>(null);

  return (
    <BoardShell title="📢 공지사항" subtitle="박스 공지">
      {isAdmin && !editing && (
        <button type="button" className="btn btn-dark mb-4 w-full" onClick={() => setEditing('new')}>
          + 공지 작성
        </button>
      )}
      {editing && (
        <NoticeEditor notice={editing === 'new' ? null : editing} onDone={() => { setEditing(null); reload(); }} />
      )}
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.notices.length === 0 && <p className="card p-6 text-center text-muted">아직 공지가 없어요</p>}
      <ul className="flex flex-col gap-3">
        {data?.notices.map((n) => {
          const open = openId === n.id;
          return (
            <li key={n.id} className={`card overflow-hidden ${n.pinned ? 'border-[var(--burgundy)]' : ''}`}>
              <button type="button" className="flex w-full items-start gap-2 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpenId(open ? null : n.id)}>
                {n.pinned && <span className="chip shrink-0 border-[var(--burgundy)] bg-[var(--burgundy)] text-white">📌 고정</span>}
                <span className="flex-1 font-bold">{n.title}</span>
                <span className="shrink-0 text-xs text-muted">{formatRelative(n.created_at)}</span>
              </button>
              {open && (
                <div className="border-t-2 border-dashed border-ink/20 px-4 py-3">
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{n.body || '내용 없음'}</p>
                  {safeHttpsUrl(n.cafe_url) && (
                    <a href={safeHttpsUrl(n.cafe_url)!} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-sm mt-3">
                      네이버 카페에서 보기 ↗
                    </a>
                  )}
                  {isAdmin && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" className="btn btn-sm" onClick={() => setEditing(n)}>수정</button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          // 앱과 카페 삭제는 서로 이어지지 않는다 (네이버가 외부 삭제·삭제 알림을 지원하지 않음)
                          const cafe = safeHttpsUrl(n.cafe_url);
                          const msg = cafe
                            ? '앱에서 이 공지를 삭제할까요?\n\n네이버 카페에 올라간 글은 지워지지 않아요. 카페 글은 카페에서 따로 지워 주세요.'
                            : '이 공지를 삭제할까요?';
                          if (!confirm(msg)) return;
                          const ok = await api.del(`/notices/${n.id}`).then(
                            () => true,
                            (e) => {
                              alert(e.message);
                              return false;
                            },
                          );
                          reload();
                          if (ok && cafe && confirm('카페 글도 지우러 갈까요? (카페 글이 새 창으로 열려요)')) window.open(cafe, '_blank', 'noopener');
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </BoardShell>
  );
}

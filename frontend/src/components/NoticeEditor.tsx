'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Notice } from '@/lib/types';

// 공지 작성·수정 (관리자). 카페 글 주소 붙이기(A), 카페에도 올리기(B)
export function NoticeEditor({ notice, onDone }: { notice: Notice | null; onDone: () => void }) {
  const [title, setTitle] = useState(notice?.title ?? '');
  const [body, setBody] = useState(notice?.body ?? '');
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  // A. 카페에서 가져온 글이면 카페 글 주소 / B. 새 공지를 카페에도 올리기
  const [cafeUrl, setCafeUrl] = useState(notice?.cafe_url ?? '');
  const [postToCafe, setPostToCafe] = useState<'' | 'notice' | 'competition'>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const cafe_url = cafeUrl.trim() || null;
      if (notice) {
        await api.patch(`/notices/${notice.id}`, { title, body, pinned, cafe_url });
      } else {
        const res = await api.post<{ cafe_error?: string | null }>('/notices', {
          title,
          body,
          pinned,
          cafe_url,
          post_to_cafe: !cafe_url && postToCafe ? postToCafe : null,
        });
        if (res.cafe_error) alert(`앱 공지는 저장됐어요.
다만 카페에는 올리지 못했어요: ${res.cafe_error}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-4 flex flex-col gap-3 p-4">
      <div>
        <label className="label" htmlFor="n-title">제목</label>
        <input id="n-title" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="n-body">내용</label>
        <textarea id="n-body" className="input" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-5 w-5" />
        상단에 고정
      </label>
      <div>
        <label className="label" htmlFor="n-cafe">카페 글 주소 (카페에서 가져온 글이면 붙여 넣기)</label>
        <input id="n-cafe" className="input" inputMode="url" maxLength={1000} value={cafeUrl} onChange={(e) => setCafeUrl(e.target.value)} placeholder="https://cafe.naver.com/crossfit051/6118" />
        <p className="mt-1 text-xs text-muted">공지에 &quot;네이버 카페에서 보기&quot; 버튼이 생기고, 같은 카페 글은 두 번 가져올 수 없어요.</p>
      </div>
      {!notice && !cafeUrl.trim() && (
        <div>
          <label className="label" htmlFor="n-post">네이버 카페에도 올리기</label>
          <select id="n-post" className="input" value={postToCafe} onChange={(e) => setPostToCafe(e.target.value as '' | 'notice' | 'competition')}>
            <option value="">앱에만 올리기</option>
            <option value="notice">카페 &apos;공지사항&apos;에도 올리기</option>
            <option value="competition">카페 &apos;대회 정보 공유&apos;에도 올리기</option>
          </select>
        </div>
      )}
      {error && <p className="text-sm font-bold text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-dark flex-1" disabled={saving || !title.trim()} onClick={save}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="btn" onClick={onDone}>취소</button>
      </div>
    </div>
  );
}

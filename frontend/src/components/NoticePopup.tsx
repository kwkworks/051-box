'use client';

import { useRef } from 'react';
import { useDismiss } from '@/lib/useDismiss';
import type { Notice } from '@/lib/types';

// 새 공지 팝업: 아직 안 본 새 공지가 있으면 박스에 들어올 때 한 번만 띄운다
export function NoticePopup({ notice, onGo, onClose }: { notice: Notice; onGo: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, onClose, ref);
  const preview = notice.body.replace(/\s+/g, ' ').trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="새 공지사항">
      <div ref={ref} className="card w-full max-w-sm overflow-hidden p-0">
        <div className="flex items-center gap-2 bg-[var(--burgundy)] px-4 py-3 text-white">
          <span aria-hidden>📢</span>
          <span className="font-black">새 공지사항</span>
          <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black">NEW</span>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="break-words text-lg font-black leading-snug">{notice.title}</p>
          {preview && <p className="line-clamp-4 break-words text-sm text-muted">{preview}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn flex-1" onClick={onClose}>
              닫기
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={onGo}>
              공지 보러 가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

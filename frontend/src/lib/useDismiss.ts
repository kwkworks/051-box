'use client';

import { useEffect, type RefObject } from 'react';

// 팝업 바깥을 누르거나 Esc를 누르면 닫는다.
// 메뉴·액션·배경음악 팝업이 모두 이걸 써서, 다른 버튼을 누르면 열려 있던 팝업이 닫힌다 (한 번에 하나만 보임).
export function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

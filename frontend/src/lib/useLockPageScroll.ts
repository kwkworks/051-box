'use client';

import { useEffect } from 'react';

// 박스 공간처럼 화면 전체를 쓰는 페이지: 문서 전체가 스크롤되거나 아이폰에서 고무줄처럼 끌려 움직이지 않게 고정한다.
// (채팅 기록처럼 안쪽 스크롤 칸은 그대로 스크롤된다.) 페이지를 떠나면 원래대로 돌려놓는다.
export function useLockPageScroll() {
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const before = els.map((el) => [el.style.overflow, el.style.overscrollBehavior] as const);
    for (const el of els) {
      el.style.overflow = 'hidden';
      el.style.overscrollBehavior = 'none';
    }
    window.scrollTo(0, 0);
    return () => {
      els.forEach((el, i) => {
        el.style.overflow = before[i][0];
        el.style.overscrollBehavior = before[i][1];
      });
    };
  }, []);
}

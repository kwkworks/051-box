import type { MetadataRoute } from 'next';

// 홈 화면에 설치하면 주소창 없이 앱처럼 열린다 (안드로이드, 아이폰 모두)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '051 BOX | 크로스핏051 커뮤니티',
    short_name: '051 BOX',
    description: '크로스핏051 회원 전용 커뮤니티: WOD, 공지, 대회 신청, 모임, 1RM, 2D 박스 공간',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait', // 설치한 앱은 세로 고정 (안드로이드에서 적용, 아이폰은 지원하지 않음)
    background_color: '#26262a',
    theme_color: '#7a2e3a',
    lang: 'ko',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

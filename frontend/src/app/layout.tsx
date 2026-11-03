import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthProvider';
import { WakeOverlay } from '@/components/WakeOverlay';
import './globals.css';

export const metadata: Metadata = {
  title: '051 BOX | 크로스핏051 커뮤니티',
  description: '크로스핏051 회원 전용 커뮤니티: WOD, 공지, 대회 신청, 모임, 1RM, 2D 박스 공간',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7a2e3a',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <AuthProvider>
          {children}
          <WakeOverlay />
        </AuthProvider>
      </body>
    </html>
  );
}

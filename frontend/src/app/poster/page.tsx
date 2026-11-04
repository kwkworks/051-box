'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Guard } from '@/components/Guard';

export default function PosterPage() {
  return <Guard need="admin">{() => <Poster />}</Guard>;
}

// 박스에 붙이는 "앱 설치" 인쇄용 포스터. 아이폰 기본 카메라로 찍으면 카카오톡을 거치지 않고 사파리로 바로 열린다.
function Poster() {
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  useEffect(() => {
    const target = `${window.location.origin}/login`;
    QRCode.toDataURL(target, { errorCorrectionLevel: 'M', margin: 1, width: 900, color: { dark: '#17171A', light: '#FFFFFF' } })
      .then((dataUrl) => {
        setUrl(target);
        setQr(dataUrl);
      })
      .catch(() => setQr(null));
  }, []);

  return (
    <div className="min-h-screen bg-white text-ink">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 p-4 print:hidden">
        <Link href="/admin" className="btn btn-sm">← 관리자</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          🖨 인쇄하기
        </button>
      </div>

      <main className="poster mx-auto flex max-w-xl flex-col items-center px-6 pb-10 pt-4 text-center print:max-w-none print:pt-10">
        <div className="h-3 w-full bg-[var(--burgundy)]" />
        <div className="h-2 w-full bg-yellow" />
        <h1 className="mt-6 text-5xl font-black tracking-tight">051 BOX</h1>
        <p className="mt-2 text-lg font-bold">크로스핏051 회원 커뮤니티 앱</p>
        <p className="mt-1 text-sm text-muted">오늘의 WOD · 내 무게 계산 · 1RM 기록 · 공지 · 대회·모임 신청</p>

        <div className="mt-6 w-64 rounded-2xl border-4 border-ink p-3 sm:w-72 print:w-[9cm]">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 QR 이미지(data URL)라 최적화 대상이 아님
            <img src={qr} alt="051 BOX 앱 설치 QR 코드" className="aspect-square w-full [image-rendering:pixelated]" />
          ) : (
            <div className="aspect-square w-full animate-pulse bg-black/10" />
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{url}</p>

        <section className="mt-6 w-full text-left">
          <h2 className="text-center text-xl font-black">📱 아이폰</h2>
          <ol className="mt-3 flex flex-col gap-2 text-[17px]">
            <li><b>1.</b> 기본 <b>카메라</b>로 QR을 찍고, 뜨는 노란 링크를 누르세요 (사파리로 열려요)</li>
            <li><b>2.</b> 아래쪽 <b>공유 버튼(□↑)</b> 또는 <b>⋯</b> → <b>홈 화면에 추가</b></li>
            <li><b>3.</b> <b>추가</b>를 누르고, 홈 화면의 <b>051 아이콘</b>으로 열어 로그인</li>
          </ol>
          <h2 className="mt-5 text-center text-xl font-black">🤖 안드로이드</h2>
          <ol className="mt-3 flex flex-col gap-2 text-[17px]">
            <li><b>1.</b> 카메라로 QR을 찍어 <b>크롬</b>으로 열기</li>
            <li><b>2.</b> 화면의 <b>설치</b> 버튼 (또는 ⋮ → <b>앱 설치</b>)</li>
          </ol>
        </section>

        <p className="mt-8 rounded-xl bg-[var(--bg)] px-4 py-3 text-sm">
          카카오 또는 구글로 가입 → <b>관리자 승인</b> 후 이용할 수 있어요
        </p>
        <div className="mt-6 h-2 w-full bg-yellow" />
        <div className="h-3 w-full bg-[var(--burgundy)]" />
      </main>
    </div>
  );
}

// 지금 배포된 버전 번호. 열려 있는 화면이 자기 버전과 비교해서 새 버전 안내를 띄운다
export function GET() {
  return Response.json(
    { id: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

// 환경변수를 시작할 때 한 번 검증한다. 값이 없으면 서버를 띄우지 않는다.
// service_role 키는 의도적으로 사용하지 않는다: 모든 DB 접근은 요청한 사용자의 권한(RLS)으로 실행된다.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.example을 참고하세요.`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: required('SUPABASE_URL'),
  supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  // 쉼표로 여러 개 지정 가능 (예: 배포 주소 + 로컬 개발 주소)
  allowedOrigins: required('ALLOWED_ORIGIN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  // 푸시 알림 (선택). 없으면 알림만 보내지 않는다. 비공개 키와 PUSH_SECRET은 Render 환경변수에만 둔다
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@051box.invalid',
  pushSecret: process.env.PUSH_SECRET ?? '',
};

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[보안] SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지만 이 서버는 사용하지 않습니다. 환경변수에서 제거하세요.');
}

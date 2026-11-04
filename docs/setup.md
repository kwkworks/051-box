# 설정과 배포 가이드

순서대로 진행한다. 계정 생성과 비밀값 입력은 운영자가 직접 한다.
**service_role(secret) 키는 어디에도 넣지 않는다.** 이 앱은 publishable 키만 사용한다.

## 1. Supabase (DB)

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성 (Region: Northeast Asia (Seoul) 권장)
2. **SQL Editor**에서 [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql) 전체를 실행
   - (또는 Supabase MCP로 적용: 아래 6절)
3. **Project Settings > API Keys**에서 복사
   - Project URL → `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (`sb_publishable_...`) → `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. **Realtime > Settings**: "Allow public access"를 **끈다** (비공개 채널만 허용 → 승인된 회원만 2D 공간 접속)
5. **Authentication > URL Configuration**
   - Site URL: 배포된 프론트 주소 (로컬 개발 중에는 `http://localhost:3000`)
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://<프론트 주소>/auth/callback`

## 2. 소셜 로그인

Supabase 콜백 주소: `https://<project-ref>.supabase.co/auth/v1/callback`

### 카카오
1. [Kakao Developers](https://developers.kakao.com) > 내 애플리케이션 > 앱 만들기
2. 앱 키의 **REST API 키** → Supabase Kakao Provider의 Client ID
3. 카카오 로그인 활성화, Redirect URI에 Supabase 콜백 주소 등록
4. 보안 > **Client Secret** 생성 후 "사용함"으로 활성화 → Supabase의 Client Secret
5. 동의항목: 닉네임, 프로필 사진만 설정 (이메일 요청 안 함)
6. Supabase **Authentication > Providers > Kakao** 켜고 키 입력, **"Allow users without an email" 켬**

### 구글
1. [Google Cloud Console](https://console.cloud.google.com) > API 및 서비스 > OAuth 동의 화면 구성 (외부, 앱 이름 "051 BOX")
2. 사용자 인증 정보 > OAuth 클라이언트 ID (웹 애플리케이션)
   - 승인된 리디렉션 URI: Supabase 콜백 주소
3. Supabase **Authentication > Providers > Google** 켜고 Client ID / Secret 입력

## 3. 로컬 실행 확인

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

`http://localhost:3000` 접속 → 로그인 → "승인 대기" 화면이 나오면 정상.

## 4. 첫 관리자 지정

처음 로그인한 뒤 Supabase SQL Editor에서 실행 (닉네임은 본인 것으로):

```sql
update public.profiles set role = 'admin' where nickname = '내닉네임';
```

앱 안에서는 관리자로 스스로 승격할 방법이 없다. 이후 회원 승인은 앱의 관리자 화면에서 한다.

## 5. 배포

### 백엔드: Render
1. [render.com](https://render.com) > New > Web Service > GitHub 저장소 연결
2. Root Directory: `backend` / Build: `npm install` / Start: `npm start` / Instance: Free
3. Environment: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGIN`(프론트 주소), `NODE_ENV=production`
4. 배포 후 `https://<이름>.onrender.com/health` 가 `{"ok":true}`면 성공

### 프론트엔드: Vercel
1. [vercel.com](https://vercel.com) > Add New Project > GitHub 저장소 > Root Directory: `frontend`
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`(Render 주소)
3. 배포 후 Render의 `ALLOWED_ORIGIN`과 Supabase의 Site URL / Redirect URLs를 Vercel 주소로 업데이트

### 잠듦 보완: 핑
- [UptimeRobot](https://uptimerobot.com) 등 무료 모니터에서 `https://<이름>.onrender.com/health`를 5~10분 간격으로 확인하도록 등록
- 사용 전에 Render 이용약관을 확인한다. 핑이 없어도 앱은 "서버를 깨우는 중" 안내를 보여주며 동작한다.

## 6. Supabase MCP (Claude Code에서 DB 작업)

```bash
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<project-ref>"
```

- 처음 사용할 때 브라우저에서 Supabase 로그인으로 권한을 승인한다.
- 운영 데이터가 생긴 뒤에는 읽기 전용(`&read_only=true`)으로 쓰는 것을 권장한다.

## 푸시 알림 설정 (2026-11-04)
비공개 키와 비밀값은 각 서비스에 직접 넣고, 다른 곳(채팅, 문서, GitHub)에 남기지 않는다.

1. 키 만들기 (내 컴퓨터): `npx web-push generate-vapid-keys` → Public/Private Key, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → PUSH_SECRET
2. Render 환경변수: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`(이메일 또는 mailto:이메일), `PUSH_SECRET` → 로그에 `[push] 푸시 알림 준비 완료`
3. Vercel 환경변수: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(공개 키) → Redeploy
4. Supabase SQL: `insert into private.settings (key, value) values ('push_secret_sha256', encode(extensions.digest('<PUSH_SECRET>', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;` (해시만 저장)
5. Supabase SQL: `supabase/migrations/0011_wod_push_schedule.sql` (매일 20:25 깨우기 · 20:30 발송 · 20:35 예비)
6. 앱: 게시판 → 🔔 알림 설정 → 이 기기에서 알림 받기 → 테스트 알림

키를 바꿀 때는 2~4를 같은 값으로 다시 하고, 회원들은 알림을 한 번 껐다 켜야 한다 (기존 구독은 예전 공개 키에 묶여 있음).

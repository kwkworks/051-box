# 설계 문서 (기술 선택, 아키텍처, 보안)

> PRD([PRD.md](PRD.md))를 구현하기 위한 기술 선택과 설계. 선택 이유는 [decisions.md](decisions.md) 참고.
> 최종 수정: 2026-11-03

## 1. 아키텍처: 프론트엔드 / 백엔드 / DB 분리 배포

```
[회원 폰/PC 브라우저]
        │  화면 요청
        ▼
① 프론트엔드  Next.js (Vercel)         화면만 담당, 데이터와 비밀키를 갖지 않음
        │  Authorization: Bearer <로그인 토큰>
        ▼
② 백엔드 API  Express (Render)         토큰 검증, 입력 검증, 비즈니스 로직
        │  사용자 토큰으로 DB 접근 (RLS 적용)
        ▼
③ 데이터베이스  Supabase                Postgres + Auth + Storage + Realtime

(예외) 2D 공간의 위치 공유: 브라우저 ⇄ Supabase Realtime 비공개 채널 (저장 없음, RLS로 회원만 접속)
```

| 역할 | 선택 | 배포 | 수업 근거 |
|---|---|---|---|
| 프론트엔드 | Next.js (TypeScript) + Tailwind + Canvas 2D | Vercel | 03강 실습 선택, 05강 기본 배포 후보 |
| 백엔드 | Express (Node.js, TypeScript) | Render | 05강: 별도 API 서버는 Render/Railway |
| DB | Supabase (Postgres, Auth, Storage, Realtime) | Supabase | 04·05·07강 실습 |

**수업 응용 (07강 과제 기준):** 규칙을 화면이 아니라 DB 안에서 강제하고, RLS를 테스트 계정 A/B로 검증하며, service_role 키를 노출하지 않는다.

## 2. Render 무료 서버 보완 (잠듦 대응)

Render 무료 서버는 15분 동안 요청이 없으면 잠들고 깨어나는 데 약 1분이 걸린다.

1. **안내 화면:** 첫 API 요청이 오래 걸리면 "서버를 깨우는 중이에요. 최대 1분 걸릴 수 있어요" 화면과 진행 표시를 보여준다. 로그인 화면에서 미리 `/health`를 호출해 서버를 깨운다.
2. **핑:** 무료 외부 모니터(UptimeRobot 등)가 `/health`를 5~10분 간격으로 호출한다. (사용 전에 Render 약관 확인)
3. 둘 다 실패해도 서비스는 동작하고 첫 접속만 느리다.

## 3. API 설계

| 메서드 | 경로 | 설명 | 권한 |
|---|---|---|---|
| GET | `/health` | 서버 상태 (인증 없음, 핑용) | 누구나 |
| GET / PATCH | `/me` | 내 정보, 스트릭 / 닉네임, 캐릭터 저장 | 로그인 |
| POST | `/attendance` | 오늘 출석 체크 | 회원 |
| GET | `/wods?date=` | 날짜별 WOD + 기록 사진(서명 URL) | 회원 |
| PUT / DELETE | `/wods/:date`, `/wods/:id` | WOD 작성·수정 / 삭제 | 관리자 |
| POST / DELETE | `/wods/:id/photos` | 기록 사진 업로드 / 삭제 | 관리자 |
| GET / POST | `/notices` | 목록 / 작성 | 회원 / 관리자 |
| PATCH / DELETE | `/notices/:id` | 수정 / 삭제 | 관리자 |
| GET / POST | `/events` | 목록 / 작성 (모임은 회원도 가능) | 회원 |
| GET / DELETE | `/events/:id` | 상세(참가자 포함) / 삭제 | 회원 / 작성자·관리자 |
| POST / DELETE | `/events/:id/join` | 참가 / 취소 | 회원(본인) |
| GET / POST | `/one-rm` | 내 기록 + 순위 / 추가 | 회원 |
| DELETE | `/one-rm/:id` | 내 기록 삭제 | 회원(본인) |
| GET | `/feed` | 명예의 벽 | 회원 |
| GET / PATCH | `/admin/members` | 회원 목록 / 승인·역할 변경 | 관리자 |
| GET / POST / DELETE | `/admin/holidays` | 휴무일 관리 | 관리자 |

## 4. 보안 설계

### 4-1. 이중 방어
1. **백엔드:** 모든 요청의 로그인 토큰을 검증하고, zod로 입력값을 검증하고, 역할을 확인한다.
2. **DB(RLS):** 백엔드가 실수해도 DB가 한 번 더 막는다. 백엔드는 **service_role 키를 쓰지 않고**, 요청한 사용자의 토큰으로 DB에 접근한다 (RLS가 그대로 적용됨).

### 4-2. 위협과 대응

| 위협 | 대응 |
|---|---|
| 승인되지 않은 사람이 데이터를 봄 | 모든 테이블 RLS. `is_member()` 함수로 DB가 직접 확인 |
| 승인되지 않은 사람이 2D 공간에 접속 | Realtime **비공개 채널** + `realtime.messages` RLS |
| 회원이 남의 기록/신청을 수정 | RLS `user_id = auth.uid()` |
| 회원이 자기 role을 admin으로 변경 | `profiles` 업데이트 트리거가 관리자가 아닌 사용자의 role 변경을 거부 |
| 정원 초과 신청 | **DB 트리거**에서 정원을 검사해 거부 (화면/백엔드에만 의존하지 않음) |
| 지난 날짜로 출석 위조 | 출석 날짜는 DB 기본값(한국 시간 오늘)만 허용 |
| PR 피드 위조 | `activities`는 클라이언트 쓰기 정책 없음. 트리거(security definer)만 작성 |
| 기록 사진 무단 열람/업로드 | 비공개 버킷 + storage RLS, 이미지 MIME과 5MB 제한 |
| 비밀키 유출 | 프론트에는 공개(publishable) 키만. 백엔드 비밀값은 Render 환경변수에만. `.env*`는 gitignore. 로그에 토큰 출력 금지 |
| CORS 악용 | 백엔드는 프론트 도메인(Origin)만 허용 |
| XSS | React 이스케이프, `dangerouslySetInnerHTML` 미사용, 링크는 `https://`만 허용, 말풍선은 Canvas 텍스트로 그림 |
| CSRF | 쿠키 대신 `Authorization` 헤더 토큰 사용 (브라우저가 자동으로 붙이지 않음) |
| 무차별 요청 | 백엔드 rate limit (express-rate-limit), 요청 본문 크기 제한 |
| 말풍선 도배 | 전송 간격과 60자 제한, 저장하지 않음 |
| 오픈 리다이렉트 | 로그인 후 이동 경로는 `/`로 시작하는 내부 경로만 허용 |
| 잘못된 입력 | 모든 API 입력을 zod로 검증. 캐릭터 파츠는 허용 목록만 저장 |
| 보안 헤더 | 백엔드 helmet, 프론트 CSP / X-Frame-Options / Referrer-Policy |
| 의존성 취약점 | `npm audit` 점검, 불필요한 패키지 최소화 |

### 4-3. 검증 방법 (07강 방식)
- 테스트 계정 A(회원), B(회원), C(승인 대기), D(관리자)로 RLS 시나리오를 실행하고 결과를 `docs/security-test.md`에 기록한다.
- 시나리오: A가 B의 기록 수정 시도, C가 WOD 조회 시도, A가 자기 role 변경 시도, 정원 초과 신청, 비회원 Realtime 접속 시도.

### 4-4. 첫 관리자 지정
운영자가 처음 로그인한 뒤 Supabase SQL Editor에서 본인 계정의 role을 `admin`으로 직접 변경한다. 앱 안에는 관리자로 스스로 승격하는 경로가 없다.

## 5. 2D 박스 공간 구현

- **렌더링:** HTML Canvas 2D. 탑뷰 픽셀 스타일, 모든 그래픽을 코드로 직접 그린다 (외부 에셋/저작권 문제 없음).
- **맵:** 타일 격자. 실제 박스(흰 벽, 검은 매트, 노란 기둥, 버건디/노랑 띠, 리그, 에어바이크, 화이트보드, 원형 로고 데스크, 상장 벽, 팀 배너 벽)를 옮긴다.
- **이동:** PC는 방향키/WASD, 모바일은 탭 이동. 벽과 오브젝트는 충돌 처리.
- **캐릭터:** 파츠 조합(피부, 머리 모양/색, 상의/하의/신발 색, 액세서리). 정면, 좌우, 뒷모습 스프라이트를 코드로 생성.
- **실시간:** Supabase Realtime Presence(접속자와 캐릭터), Broadcast(위치, 말풍선). 위치는 초당 5~10회로 제한.
- **빠른 메뉴:** 모든 게시판에 바로 접근하는 메뉴 (모바일 편의, 접근성).

## 6. 폴더 구조 (모노레포)

```
box-community/
├─ docs/                 PRD, 설계, 결정 기록, 보안 테스트
├─ frontend/             Next.js (Vercel 배포)
├─ backend/              Express (Render 배포)
└─ supabase/
   ├─ migrations/        테이블, RLS, 트리거 SQL
   └─ seed.sql           테스트 계정/데이터
```

## 7. 배포와 비밀값 관리

| 대상 | 환경변수 | 위치 |
|---|---|---|
| 프론트 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL` | Vercel 설정 |
| 백엔드 | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGIN` | Render 설정 |
| 공통 | `.env.local`은 로컬에만 두고 gitignore. `.env.example`만 커밋 | |

- 로그인 설정: Supabase Auth의 Site URL과 Redirect URL을 배포 주소로 바꾼다 (07강).
- 개발 중에는 이메일 확인을 끄고, 소셜 로그인만 사용하므로 별도 SMTP는 필요 없다.

# 051 BOX: 크로스핏051 회원 커뮤니티

실제 크로스핏051 박스를 옮겨놓은 **2D 픽셀 공간**에서 내 캐릭터로 돌아다니며 WOD, 공지, 대회 신청, 모임, 1RM 기록을 확인하는 박스 전용 커뮤니티 웹앱입니다.
네이버 카페에 흩어져 있던 공지와, 회원들이 오프라인에서 따로 모여 하던 대회 신청을 한 곳으로 모았습니다.

- **배포 주소:** https://051-box.vercel.app (백엔드 API: https://zero51-box.onrender.com/health)
- 회원 전용 서비스라 로그인 후 관리자 승인이 필요합니다. 무료 서버라 오래 쉬었다면 첫 접속에 최대 1분 걸릴 수 있습니다.
- **기획 문서:** [docs/PRD.md](docs/PRD.md) · 설계: [docs/design.md](docs/design.md) · 결정 기록: [docs/decisions.md](docs/decisions.md)

## 주요 기능

| 기능 | 설명 |
|---|---|
| 2D 박스 공간 | 실제 박스(리그, 에어바이크, 노란 기둥, 화이트보드, 데스크)를 탑뷰 픽셀 맵으로 구현. 입구 옆 🗂 게시판 키오스크를 클릭하면 걸어가서 열림. 점프·앉기·춤·달리기 액션 (모바일은 🎮 액션 버튼) |
| 실시간 함께 보기 + 박스 채팅 | 접속한 회원 캐릭터가 실시간으로 보이고, 채팅은 오늘 내가 접속해 있던 동안의 대화만 보임 (이전 접속 대화는 구분선으로 표시, 도배 방지, 관리자 채팅 제한·잠금) |
| 배경 음악 | 게임풍 칩튠 BGM을 브라우저에서 합성 (음원 파일 없음), 음량 조절·음소거 |
| 게시판 모음 | 입구 옆 키오스크와 `/board`에서 모든 기능을 이름·설명과 함께 바로 열기 |
| 스마트폰 앱 (PWA) | 안드로이드·아이폰 홈 화면에 051 아이콘으로 설치 |
| 구글 시트 WOD | 관리자가 웹에 게시한 구글 시트에서 버튼 하나로 WOD 가져오기 |
| 캐릭터 꾸미기 | 24×32 픽셀, 16개 항목(눈·눈썹·입·수염, 헤어 11종, 리프팅 벨트·무릎 슬리브 등 운동 장비). 그림은 모두 코드로 그림 |
| 오늘/내일 WOD + 내 무게 자동 계산 | 코치가 올린 강도(%)와 내 1RM으로 정확한 무게를 계산 |
| 기록 사진 | 코치가 화이트보드 사진을 올리면 회원이 확인 (비공개 스토리지) |
| 출석 체크 + 스트릭 | 일요일과 공휴일·휴무일을 빼고 연속 출석일 계산 |
| 공지사항 | 상단 고정 지원 |
| 대회·이벤트·모임 | 버튼 하나로 참가 신청. 정원과 마감은 DB가 강제 |
| 1RM 기록 + PR 명예의 벽 | 종목별 기록과 박스 순위. 첫 기록이나 기록 경신 시 PR 축하 글이 자동 게시(벽에는 오늘 기록만), 기록을 지우면 함께 삭제 |
| 가입 승인 | 카카오/구글 로그인 후 관리자가 승인해야 이용 가능 |

## 구조: 프론트엔드 / 백엔드 / DB 분리 배포

```
브라우저 ──▶ ① 프론트엔드  Next.js (Vercel)       화면만 담당
              │  Authorization: Bearer <로그인 토큰>
              ▼
           ② 백엔드 API  Express (Render)       토큰 검증, 입력 검증(zod), 비즈니스 로직
              │  사용자 토큰으로 접근 → RLS 적용
              ▼
           ③ DB  Supabase                      Postgres + Auth + Storage + Realtime
```

| 폴더 | 역할 |
|---|---|
| [frontend/](frontend) | Next.js 16 + Tailwind. 2D 공간은 Canvas 2D로 직접 구현 ([src/game](frontend/src/game)) |
| [backend/](backend) | Express 5 API 서버 ([src/routes](backend/src/routes)) |
| [supabase/migrations](supabase/migrations) | 테이블, RLS 정책, 트리거 SQL |
| [docs/](docs) | PRD, 설계, 결정 기록, 보안 테스트 |

## 과제 평가 항목 대응

| 평가 문항 | 구현 |
|---|---|
| 1. PRD | [docs/PRD.md](docs/PRD.md): 문제 정의, 타겟 유저, MVP 기능 15개, 화면 구성, 데이터 구조 |
| 2. 프론트엔드 (화면 2개 이상) | 로그인(카카오·구글), 2D 공간, 캐릭터 꾸미기, WOD, 공지, 대회·모임 목록/상세, 1RM, 명예의 벽, 관리자 |
| 3. 백엔드/API (프레임워크) | Express API 서버: 생성/조회/수정/삭제 ([design.md 3절](docs/design.md)) |
| 4. DB 연동 | Supabase Postgres (+ Auth, Storage, Realtime) |
| 5. 배포 + 확장 | Vercel + Render + Supabase 분리 배포 / 소셜 로그인, 실시간 2D 공간, 사진 업로드 / MCP·Skill 활용 (아래) |

## AI 도구 활용 (MCP · Skill)

이 프로젝트는 Claude Code로 바이브코딩했습니다.

| 도구 | 어디에 썼나 |
|---|---|
| 서브 에이전트 | 수업 자료 PDF 7개를 3개 에이전트가 나눠 읽고, 수업에서 다룬 프론트/백엔드/DB/배포 기술을 비교해 스택 결정 ([decisions.md D12](docs/decisions.md)) |
| 웹 검색 | 2026년 기준 무료 플랜 한도(Supabase, Render, Vercel, Cloudflare), 카카오 KOE205 원인 확인 |
| Supabase MCP | 프로젝트 전용으로 연결 설정 ([.mcp.json](.mcp.json), 이 프로젝트에만 접근 가능). 이번 작업에서 스키마는 SQL Editor로 적용했고, 이후 DB 점검에 사용 |
| 내장 브라우저 미리보기 | 2D 공간 길찾기 버그(데스크 모서리에 걸림), 로그인·개인정보처리방침 화면을 직접 띄워 확인 |
| gh CLI | GitHub 저장소 생성과 업로드 |
| Next.js 공식 문서 (`node_modules/next/dist/docs`) | Next.js 16 변경점 확인 후 코드 작성 |

## 보안

- 모든 테이블에 **RLS**를 적용하고, 권한·정원·출석 날짜 규칙을 **DB 안에서** 강제합니다.
- 백엔드는 **service_role 키를 쓰지 않고** 요청한 사용자의 토큰으로 DB에 접근합니다. 백엔드에 실수가 있어도 DB가 한 번 더 막습니다.
- 회원은 자기 role을 바꿀 수 없고(DB 트리거), PR 피드는 트리거만 작성할 수 있어 위조할 수 없습니다.
- CORS 허용 목록, rate limit, helmet 보안 헤더, CSP, zod 입력 검증, 이미지 매직 바이트 검사를 적용했습니다.
- 자세한 내용: [docs/design.md 4절](docs/design.md), 검증 결과: [docs/security-test.md](docs/security-test.md)

## 로컬 실행

필요: Node.js 22 이상, Supabase 프로젝트 ([docs/setup.md](docs/setup.md) 참고)

```bash
# 백엔드
cd backend
cp .env.example .env        # 값 채우기
npm install
npm run dev                 # http://localhost:4000

# 프론트엔드 (새 터미널)
cd frontend
cp .env.example .env.local  # 값 채우기
npm install
npm run dev                 # http://localhost:3000
```
<img width="1468" height="891" alt="image" src="https://github.com/user-attachments/assets/c45d14f4-1537-477d-b3aa-460ac1bcd9c5" />
<img width="1420" height="895" alt="image" src="https://github.com/user-attachments/assets/4f5799b5-9fb4-46b2-9aec-2489ab0cf09e" />
<img width="1611" height="908" alt="image" src="https://github.com/user-attachments/assets/ca6cabd7-007c-411c-88ec-5b18d618e353" />


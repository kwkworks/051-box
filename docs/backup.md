# 데이터베이스 백업과 복원

Supabase 무료 플랜에는 자동 백업이 없어요. 그래서 GitHub Actions가 **매일 새벽 4시(한국 시간)** 에 데이터베이스 전체를 내보내고, 암호를 걸어 **30일 동안** 보관해요.

- 대상: 회원, 기록, 채팅, WOD, 공지, 모임, 알림 설정 등 데이터베이스 전체 (`.github/workflows/db-backup.yml`)
- 제외: 사진 파일 자체 (사진 목록과 순서는 포함). 사진은 Supabase 대시보드 → Storage에서 내려받을 수 있어요.
- 저장소가 공개라서 백업 파일은 반드시 **암호화**해서 올려요. 암호 없이는 열 수 없어요.

## 처음 한 번 설정하기

### 1. Supabase 접속 주소 복사
1. Supabase 대시보드 → 프로젝트 → 위쪽 **Connect** 버튼
2. **Session pooler** 주소를 복사해요. 예: `postgresql://postgres.<프로젝트ID>:[YOUR-PASSWORD]@aws-0-<지역>.pooler.supabase.com:5432/postgres`
   - GitHub 서버는 IPv6를 못 쓰기 때문에 "Direct connection"이 아니라 **Session pooler** 주소여야 해요.
3. `[YOUR-PASSWORD]` 자리에 DB 비밀번호를 넣어요.
   - 비밀번호를 모르면 Project Settings → Database → **Reset database password**로 새로 만들어요. 앱은 이 비밀번호를 쓰지 않아서 바꿔도 앱에 영향이 없어요.
   - 비밀번호에 `@ : / ? #` 같은 기호가 있으면 주소가 깨지니, 영문과 숫자로만 된 비밀번호를 추천해요.

### 2. GitHub에 비밀값 2개 등록
GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `SUPABASE_DB_URL` | 1단계에서 만든 주소 (비밀번호 포함) |
| `BACKUP_PASSPHRASE` | 백업 파일 암호. 16자 이상. **잊어버리면 백업을 열 수 없으니 따로 안전하게 적어 두세요** |

비밀값은 Claude나 다른 사람에게 보내지 말고 GitHub 화면에 직접 입력해요.

### 3. 바로 한 번 실행해 보기
GitHub 저장소 → **Actions → DB 백업 → Run workflow**. 2~3분 뒤 초록색 ✓ 이 뜨면 성공이에요.

## 백업 파일 받기
Actions → DB 백업 → 원하는 날짜의 실행 → 아래 **Artifacts**에서 `051box-db-날짜` 를 내려받아요 (zip 안에 `.tar.gz.gpg` 파일).

## 복원하기 (문제가 생겼을 때)
Git Bash(윈도우에 Git과 함께 설치됨)에서:

```bash
gpg -d 051box-db-YYYYMMDD-HHMM.tar.gz.gpg > backup.tar.gz
```

```bash
mkdir backup && tar -xzf backup.tar.gz -C backup
```

그다음 새 Supabase 프로젝트(또는 비운 기존 프로젝트)의 Session pooler 주소로:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --file backup/roles.sql --file backup/schema.sql --command 'SET session_replication_role = replica' --file backup/data.sql --dbname "<새 프로젝트 주소>"
```

복원은 되돌리기 어려운 작업이라, 필요할 때 Claude에게 같이 하자고 요청하는 걸 추천해요.

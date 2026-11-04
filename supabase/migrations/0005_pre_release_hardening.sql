-- =====================================================================
-- 0005: 테스트 사용자 배포 전 보안 보강
--  1. 닉네임: 허용 문자만(보이지 않는 문자·특수문자 사칭 방지), 대소문자 무시 중복 금지
--  2. 가입: 익명 로그인은 회원 정보를 만들지 않음, 같은 이름이면 뒤에 번호를 붙여 자동 구분
--  3. 도배 방지: 1RM 기록·모임 등록·채팅 접속 기록에 하루 상한 (API를 우회해도 DB가 막음)
--  4. 기록 사진 저장소: 공개된 WOD의 사진만 열람 가능
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 닉네임 정리 → 규칙 추가
-- ---------------------------------------------------------------------
-- 허용하지 않는 문자가 들어간 기존 닉네임 정리
update public.profiles
set nickname = coalesce(
  nullif(left(btrim(regexp_replace(nickname, '[^0-9A-Za-z가-힣 _.-]', '', 'g')), 16), ''),
  '회원' || substr(replace(id::text, '-', ''), 1, 4)
)
where nickname !~ '^[0-9A-Za-z가-힣 _.-]+$';
update public.profiles
set nickname = '회원' || substr(replace(id::text, '-', ''), 1, 4)
where char_length(nickname) < 2;

-- 중복 닉네임: 먼저 가입한 사람은 그대로, 나머지는 뒤에 번호 4자리
with dup as (
  select id, row_number() over (partition by lower(nickname) order by created_at, id) as rn
  from public.profiles
)
update public.profiles p
set nickname = left(p.nickname, 11) || '_' || substr(replace(p.id::text, '-', ''), 1, 4)
from dup
where dup.id = p.id and dup.rn > 1;

alter table public.profiles add constraint profiles_nickname_chars check (nickname ~ '^[0-9A-Za-z가-힣 _.-]+$');
create unique index profiles_nickname_unique on public.profiles (lower(nickname));

-- ---------------------------------------------------------------------
-- 2. 가입 처리
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nick text;
begin
  -- 익명 로그인은 회원 정보를 만들지 않는다 (카카오·구글 가입만 받는다)
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  nick := coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'nickname',
    ''
  );
  -- 허용 문자만 남기고 16자로 자른다
  nick := left(btrim(regexp_replace(nick, '[^0-9A-Za-z가-힣 _.-]', '', 'g')), 16);
  if char_length(nick) < 2 then
    nick := '회원' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  -- 같은 이름이 이미 있으면 뒤에 번호를 붙인다 (카카오 이름이 같은 회원)
  if exists (select 1 from public.profiles where lower(nickname) = lower(nick)) then
    nick := left(nick, 11) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles (id, nickname) values (new.id, nick);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 하루 상한 (관리자 제외)
-- ---------------------------------------------------------------------
create or replace function public.limit_daily_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  cap integer := tg_argv[1]::integer;
  owner_col text := tg_argv[0];
  owner uuid;
begin
  owner := case owner_col when 'user_id' then (to_jsonb(new) ->> 'user_id')::uuid else (to_jsonb(new) ->> 'created_by')::uuid end;
  if owner is null or public.is_admin() then
    return new;
  end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at >= public.kst_today_start()',
                 tg_table_schema, tg_table_name, owner_col)
    into n using owner;
  if n >= cap then
    raise exception '오늘은 더 등록할 수 없어요 (하루 %개까지)', cap using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger one_rm_daily_cap before insert on public.one_rm_records
  for each row execute function public.limit_daily_inserts('user_id', '20');
create trigger events_daily_cap before insert on public.events
  for each row execute function public.limit_daily_inserts('created_by', '5');

-- 채팅 접속 기록: 하루 50번까지 (새로고침을 많이 해도 충분한 수)
create or replace function public.chat_session_start()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  if not public.is_member() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  delete from public.chat_sessions where last_seen < public.kst_today_start();
  if (select count(*) from public.chat_sessions where user_id = (select auth.uid())) >= 50 then
    raise exception '오늘은 더 등록할 수 없어요 (하루 50개까지)' using errcode = 'P0001';
  end if;
  insert into public.chat_sessions (user_id) values ((select auth.uid())) returning id into sid;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 기록 사진 저장소: wod_photos에 등록되고 볼 수 있는(공개된 WOD) 사진만
-- ---------------------------------------------------------------------
drop policy if exists "wod-photos: 회원 열람" on storage.objects;
create policy "wod-photos: 회원 열람 (공개된 WOD만)" on storage.objects for select to authenticated
  using (
    bucket_id = 'wod-photos' and public.is_member()
    and exists (select 1 from public.wod_photos p where p.storage_path = name)
  );

-- ---------------------------------------------------------------------
-- 5. 관리자: 회원이 올린 1RM 기록 삭제 (연결된 PR 축하 글도 함께 지워진다)
-- ---------------------------------------------------------------------
create policy "one_rm: 관리자 삭제" on public.one_rm_records for delete to authenticated
  using (public.is_admin());

commit;

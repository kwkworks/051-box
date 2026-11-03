-- =====================================================================
-- 051 BOX: 초기 스키마
-- 보안 원칙: 모든 규칙(권한, 정원, 날짜)은 화면이나 백엔드가 아니라 DB 안에서 강제한다.
-- 백엔드는 service_role 키를 쓰지 않고 사용자의 로그인 토큰으로 접근하므로 아래 RLS가 그대로 적용된다.
-- 전체를 한 트랜잭션으로 실행한다: 중간에 실패하면 아무것도 적용되지 않는다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. 공통 함수
-- ---------------------------------------------------------------------

-- 한국 시간 기준 오늘 날짜 (출석, 1RM 날짜 검증에 사용)
create or replace function public.kst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. profiles: 회원 정보 (auth.users와 1:1)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 2 and 16),
  role        text not null default 'pending' check (role in ('pending', 'member', 'admin')),
  avatar      jsonb not null default '{}'::jsonb
              check (jsonb_typeof(avatar) = 'object' and pg_column_size(avatar) < 2000),
  created_at  timestamptz not null default now()
);

-- 승인된 회원인지 / 관리자인지 확인 (RLS 정책에서 사용)
-- security definer: profiles의 RLS를 다시 타지 않도록 (무한 재귀 방지)
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('member', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 가입 시 profiles 자동 생성 (항상 pending으로 시작)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nick text;
begin
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
  insert into public.profiles (id, nickname) values (new.id, nick);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- role 변경 보호: 앱 사용자(authenticated)는 관리자만 role을 바꿀 수 있고, 관리자도 자기 role은 못 바꾼다.
-- (security invoker로 두어 current_user로 호출 주체를 구분한다. SQL Editor의 postgres는 첫 관리자 지정 가능)
create or replace function public.protect_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception '변경할 수 없는 항목입니다' using errcode = 'P0001';
  end if;
  if new.role is distinct from old.role and current_user = 'authenticated' then
    if not public.is_admin() then
      raise exception '권한이 없습니다' using errcode = '42501';
    end if;
    if new.id = (select auth.uid()) then
      raise exception '자신의 권한은 변경할 수 없습니다' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

alter table public.profiles enable row level security;

create policy "profiles: 본인 또는 회원이 조회"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_member());

create policy "profiles: 본인 또는 관리자가 수정"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- 컬럼 단위 권한: 앱에서는 nickname, avatar, role만 수정 가능 (role은 위 트리거가 추가로 보호)
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nickname, avatar, role) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. wods: 날짜별 WOD
-- ---------------------------------------------------------------------
create table public.wods (
  id          uuid primary key default gen_random_uuid(),
  wod_date    date not null unique,
  title       text not null check (char_length(title) between 1 and 80),
  content     text not null default '' check (char_length(content) <= 4000),
  lifts       jsonb not null default '[]'::jsonb
              check (jsonb_typeof(lifts) = 'array' and jsonb_array_length(lifts) <= 10),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger wods_updated_at before update on public.wods
  for each row execute function public.set_updated_at();

alter table public.wods enable row level security;
create policy "wods: 회원 조회" on public.wods for select to authenticated using (public.is_member());
create policy "wods: 관리자 작성" on public.wods for insert to authenticated with check (public.is_admin());
create policy "wods: 관리자 수정" on public.wods for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "wods: 관리자 삭제" on public.wods for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. wod_photos: 화이트보드 기록 사진
-- ---------------------------------------------------------------------
create table public.wod_photos (
  id            uuid primary key default gen_random_uuid(),
  wod_id        uuid not null references public.wods (id) on delete cascade,
  storage_path  text not null unique check (storage_path ~ '^wods/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  uploaded_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index wod_photos_wod_id_idx on public.wod_photos (wod_id);

alter table public.wod_photos enable row level security;
create policy "wod_photos: 회원 조회" on public.wod_photos for select to authenticated using (public.is_member());
create policy "wod_photos: 관리자 등록" on public.wod_photos for insert to authenticated with check (public.is_admin());
create policy "wod_photos: 관리자 삭제" on public.wod_photos for delete to authenticated using (public.is_admin());

-- 스토리지: 비공개 버킷, 이미지만, 5MB 이하
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wod-photos', 'wod-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "wod-photos: 회원 열람" on storage.objects for select to authenticated
  using (bucket_id = 'wod-photos' and public.is_member());
create policy "wod-photos: 관리자 업로드" on storage.objects for insert to authenticated
  with check (bucket_id = 'wod-photos' and public.is_admin());
create policy "wod-photos: 관리자 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'wod-photos' and public.is_admin());

-- ---------------------------------------------------------------------
-- 4. holidays + attendance: 출석 스트릭
-- ---------------------------------------------------------------------
create table public.holidays (
  day   date primary key,
  name  text not null check (char_length(name) between 1 and 30)
);

alter table public.holidays enable row level security;
create policy "holidays: 회원 조회" on public.holidays for select to authenticated using (public.is_member());
create policy "holidays: 관리자 추가" on public.holidays for insert to authenticated with check (public.is_admin());
create policy "holidays: 관리자 삭제" on public.holidays for delete to authenticated using (public.is_admin());

create table public.attendance (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  attend_date  date not null default public.kst_today(),
  created_at   timestamptz not null default now(),
  primary key (user_id, attend_date)
);

alter table public.attendance enable row level security;
create policy "attendance: 본인 조회" on public.attendance for select to authenticated
  using (user_id = (select auth.uid()));
-- 날짜 위조 방지: 본인 + 오늘(한국 시간)만 기록 가능
create policy "attendance: 본인 오늘만 출석" on public.attendance for insert to authenticated
  with check (user_id = (select auth.uid()) and attend_date = public.kst_today() and public.is_member());

-- 내 연속 출석일: 일요일과 휴무일은 건너뛰고, 오늘은 아직 출석 전이어도 끊긴 것으로 보지 않는다.
create or replace function public.my_streak()
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  uid     uuid := (select auth.uid());
  d       date := public.kst_today();
  streak  integer := 0;
  i       integer := 0;
begin
  if uid is null then
    return 0;
  end if;
  -- 오늘 출석 전이면 어제부터 센다
  if not exists (select 1 from public.attendance where user_id = uid and attend_date = d) then
    d := d - 1;
  end if;
  while i < 1000 loop
    i := i + 1;
    if extract(isodow from d) = 7 or exists (select 1 from public.holidays where day = d) then
      d := d - 1;
      continue;
    end if;
    exit when not exists (select 1 from public.attendance where user_id = uid and attend_date = d);
    streak := streak + 1;
    d := d - 1;
  end loop;
  return streak;
end;
$$;

revoke execute on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- ---------------------------------------------------------------------
-- 5. notices: 공지
-- ---------------------------------------------------------------------
create table public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 100),
  body        text not null default '' check (char_length(body) <= 5000),
  pinned      boolean not null default false,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger notices_updated_at before update on public.notices
  for each row execute function public.set_updated_at();

alter table public.notices enable row level security;
create policy "notices: 회원 조회" on public.notices for select to authenticated using (public.is_member());
create policy "notices: 관리자 작성" on public.notices for insert to authenticated with check (public.is_admin());
create policy "notices: 관리자 수정" on public.notices for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "notices: 관리자 삭제" on public.notices for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. events + event_participants: 대회 / 이벤트 / 모임
-- ---------------------------------------------------------------------
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('competition', 'event', 'gathering')),
  title            text not null check (char_length(title) between 1 and 80),
  description      text not null default '' check (char_length(description) <= 3000),
  starts_at        timestamptz not null,
  location         text not null default '' check (char_length(location) <= 100),
  link_url         text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  signup_deadline  timestamptz,
  capacity         integer check (capacity is null or capacity between 1 and 500),
  created_by       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now()
);
create index events_starts_at_idx on public.events (starts_at);

alter table public.events enable row level security;
create policy "events: 회원 조회" on public.events for select to authenticated using (public.is_member());
-- 대회/이벤트는 관리자만, 모임은 회원 누구나 (본인 이름으로만)
create policy "events: 작성" on public.events for insert to authenticated
  with check (
    public.is_admin()
    or (kind = 'gathering' and created_by = (select auth.uid()) and public.is_member())
  );
create policy "events: 작성자 또는 관리자 수정" on public.events for update to authenticated
  using (public.is_admin() or (created_by = (select auth.uid()) and public.is_member()))
  with check (public.is_admin() or (kind = 'gathering' and created_by = (select auth.uid())));
create policy "events: 작성자 또는 관리자 삭제" on public.events for delete to authenticated
  using (public.is_admin() or (created_by = (select auth.uid()) and public.is_member()));

create table public.event_participants (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_participants_user_idx on public.event_participants (user_id);

alter table public.event_participants enable row level security;
create policy "participants: 회원 조회" on public.event_participants for select to authenticated using (public.is_member());
create policy "participants: 본인 신청" on public.event_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member());
create policy "participants: 본인 또는 관리자 취소" on public.event_participants for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- 정원과 마감은 DB에서 강제한다. 이벤트 행을 잠가서 동시에 신청해도 정원을 넘지 않는다.
create or replace function public.check_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev     public.events%rowtype;
  taken  integer;
begin
  select * into ev from public.events where id = new.event_id for update;
  if not found then
    raise exception '이벤트를 찾을 수 없습니다' using errcode = 'P0001';
  end if;
  if ev.signup_deadline is not null and now() > ev.signup_deadline then
    raise exception '신청이 마감되었습니다' using errcode = 'P0001';
  end if;
  if ev.capacity is not null then
    select count(*) into taken from public.event_participants where event_id = new.event_id;
    if taken >= ev.capacity then
      raise exception '정원이 가득 찼습니다' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger event_participants_capacity
  before insert on public.event_participants
  for each row execute function public.check_event_capacity();

-- ---------------------------------------------------------------------
-- 7. one_rm_records: 1RM 기록 + activities: 명예의 벽
-- ---------------------------------------------------------------------
create table public.one_rm_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  movement     text not null check (char_length(movement) between 1 and 30),
  is_custom    boolean not null default false,
  weight_kg    numeric(5, 1) not null check (weight_kg > 0 and weight_kg <= 500),
  achieved_on  date not null default public.kst_today(),
  created_at   timestamptz not null default now(),
  check (
    is_custom or movement in (
      'back_squat', 'front_squat', 'overhead_squat', 'deadlift', 'clean', 'power_clean',
      'clean_and_jerk', 'snatch', 'power_snatch', 'push_press', 'strict_press', 'bench_press', 'thruster'
    )
  )
);
create index one_rm_user_movement_idx on public.one_rm_records (user_id, movement, weight_kg desc);

alter table public.one_rm_records enable row level security;
create policy "one_rm: 회원 조회" on public.one_rm_records for select to authenticated using (public.is_member());
create policy "one_rm: 본인 기록" on public.one_rm_records for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member() and achieved_on <= public.kst_today());
create policy "one_rm: 본인 삭제" on public.one_rm_records for delete to authenticated
  using (user_id = (select auth.uid()));

-- 사람별, 종목별 최고 기록 (순위용). security_invoker로 조회자의 RLS를 그대로 적용
create view public.one_rm_best
with (security_invoker = true)
as
  select distinct on (r.user_id, r.movement)
    r.user_id, r.movement, r.is_custom, r.weight_kg, r.achieved_on, p.nickname
  from public.one_rm_records r
  join public.profiles p on p.id = r.user_id
  order by r.user_id, r.movement, r.weight_kg desc, r.achieved_on desc;

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('pr')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activities_created_idx on public.activities (created_at desc);

-- 클라이언트 쓰기 정책 없음: 아래 트리거만 기록할 수 있다 (위조 방지)
alter table public.activities enable row level security;
create policy "activities: 회원 조회" on public.activities for select to authenticated using (public.is_member());

-- 기존 최고 기록보다 높으면 PR 축하 글을 남긴다 (첫 기록은 PR로 보지 않음)
create or replace function public.record_pr()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev_best numeric;
begin
  select max(weight_kg) into prev_best
  from public.one_rm_records
  where user_id = new.user_id and movement = new.movement and id <> new.id;

  if prev_best is not null and new.weight_kg > prev_best then
    insert into public.activities (user_id, kind, payload)
    values (
      new.user_id, 'pr',
      jsonb_build_object(
        'movement', new.movement, 'is_custom', new.is_custom,
        'weight_kg', new.weight_kg, 'prev_kg', prev_best
      )
    );
  end if;
  return new;
end;
$$;

create trigger one_rm_pr
  after insert on public.one_rm_records
  for each row execute function public.record_pr();

-- ---------------------------------------------------------------------
-- 8. 테이블 권한 (RLS가 행 단위로 다시 거른다). anon(비로그인)에는 아무 권한도 주지 않는다.
-- ---------------------------------------------------------------------
revoke all on public.wods, public.wod_photos, public.holidays, public.attendance, public.notices,
  public.events, public.event_participants, public.one_rm_records, public.activities, public.one_rm_best
  from anon, authenticated;

grant select, insert, update, delete on public.wods, public.notices, public.events to authenticated;
grant select, insert, delete on public.wod_photos, public.holidays, public.event_participants, public.one_rm_records to authenticated;
grant select, insert on public.attendance to authenticated;
grant select on public.activities, public.one_rm_best to authenticated;

-- ---------------------------------------------------------------------
-- 9. Realtime: 2D 공간 비공개 채널 'box-space'는 승인된 회원만 듣고 보낼 수 있다
-- (Supabase 대시보드 Realtime 설정에서 "Allow public access"를 꺼야 비공개 채널만 허용된다)
-- ---------------------------------------------------------------------
create policy "box-space: 회원 수신" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'box-space' and public.is_member());
create policy "box-space: 회원 송신" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'box-space' and public.is_member());

-- ---------------------------------------------------------------------
-- 10. 휴무일 기본 데이터 (법정공휴일 + 대체공휴일, 2026~2027)
-- 음력 공휴일과 대체공휴일은 정부 발표로 바뀔 수 있으니 관리자 화면에서 확인하고 수정한다.
-- ---------------------------------------------------------------------
insert into public.holidays (day, name) values
  ('2026-01-01', '신정'),
  ('2026-02-16', '설날 연휴'), ('2026-02-17', '설날'), ('2026-02-18', '설날 연휴'),
  ('2026-03-02', '삼일절 대체공휴일'),
  ('2026-05-05', '어린이날'),
  ('2026-05-25', '부처님오신날 대체공휴일'),
  ('2026-06-03', '전국동시지방선거'),
  ('2026-06-06', '현충일'),
  ('2026-08-15', '광복절'), ('2026-08-17', '광복절 대체공휴일'),
  ('2026-09-24', '추석 연휴'), ('2026-09-25', '추석'), ('2026-09-26', '추석 연휴'),
  ('2026-10-03', '개천절'), ('2026-10-05', '개천절 대체공휴일'),
  ('2026-10-09', '한글날'),
  ('2026-12-25', '성탄절'),
  ('2027-01-01', '신정'),
  ('2027-02-06', '설날 연휴'), ('2027-02-08', '설날 연휴'), ('2027-02-09', '설날 대체공휴일'),
  ('2027-03-01', '삼일절'),
  ('2027-05-05', '어린이날'),
  ('2027-05-13', '부처님오신날'),
  ('2027-08-16', '광복절 대체공휴일'),
  ('2027-09-14', '추석 연휴'), ('2027-09-15', '추석'), ('2027-09-16', '추석 연휴'),
  ('2027-10-04', '개천절 대체공휴일'),
  ('2027-10-11', '한글날 대체공휴일'),
  ('2027-12-27', '성탄절 대체공휴일')
on conflict (day) do nothing;

commit;

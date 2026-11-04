-- =====================================================================
-- 0003: PR 규칙 변경, 채팅을 "오늘 + 내가 접속해 있던 동안"으로 제한, 관리자 채팅 제한/잠금
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- 한국 시간 오늘 0시 (timestamptz)
create or replace function public.kst_today_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (public.kst_today()::timestamp at time zone 'Asia/Seoul');
$$;

-- ---------------------------------------------------------------------
-- 1. PR: 그 종목의 첫 기록도 "내 최고 기록"이므로 명예의 벽에 올린다
-- ---------------------------------------------------------------------
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

  if prev_best is null or new.weight_kg > prev_best then
    insert into public.activities (user_id, kind, payload, one_rm_id)
    values (
      new.user_id, 'pr',
      jsonb_build_object(
        'movement', new.movement, 'is_custom', new.is_custom,
        'weight_kg', new.weight_kg, 'prev_kg', prev_best
      ),
      new.id
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 채팅 접속 기록: 내가 박스에 있던 시간대
--    클라이언트는 직접 쓰지 못하고, 아래 함수로만 시작/갱신한다 (시간 위조 방지)
-- ---------------------------------------------------------------------
create table public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index chat_sessions_user_idx on public.chat_sessions (user_id, started_at);

alter table public.chat_sessions enable row level security;
create policy "chat_sessions: 본인 조회" on public.chat_sessions for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.chat_sessions from anon, authenticated;
grant select on public.chat_sessions to authenticated;

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
  insert into public.chat_sessions (user_id) values ((select auth.uid())) returning id into sid;
  return sid;
end;
$$;

-- 90초 안에 갱신해야 이어진다. 오래 끊겼다면 false → 클라이언트가 새 접속을 시작한다
-- (끊긴 동안의 대화가 이어 붙어서 보이지 않게)
create or replace function public.chat_session_ping(sid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.chat_sessions
  set last_seen = now()
  where id = sid and user_id = (select auth.uid()) and last_seen > now() - interval '90 seconds';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.chat_session_start() from public, anon;
revoke execute on function public.chat_session_ping(uuid) from public, anon;
grant execute on function public.chat_session_start() to authenticated;
grant execute on function public.chat_session_ping(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 채팅 조회: 오늘 대화 중 "내가 접속해 있던 동안" 오간 것과 내가 쓴 것만
-- ---------------------------------------------------------------------
drop policy if exists "chat: 회원이 최근 7일 조회" on public.chat_messages;
create policy "chat: 내가 있던 동안의 오늘 대화" on public.chat_messages for select to authenticated
  using (
    public.is_member()
    and created_at >= public.kst_today_start()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.chat_sessions s
        where s.user_id = (select auth.uid())
          and chat_messages.created_at >= s.started_at
          and chat_messages.created_at <= s.last_seen + interval '90 seconds'
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. 관리자 채팅 제한(회원별) / 전체 잠금
-- ---------------------------------------------------------------------
alter table public.profiles add column chat_muted_until timestamptz;
grant update (chat_muted_until) on public.profiles to authenticated;

-- 회원이 자기 채팅 제한을 풀지 못하게 (관리자만 변경)
create or replace function public.protect_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception '변경할 수 없는 항목입니다' using errcode = 'P0001';
  end if;
  if current_user = 'authenticated' then
    if (new.role is distinct from old.role or new.chat_muted_until is distinct from old.chat_muted_until)
       and not public.is_admin() then
      raise exception '권한이 없습니다' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and new.id = (select auth.uid()) then
      raise exception '자신의 권한은 변경할 수 없습니다' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in ('wod_sheet_url', 'chat_locked'));

-- 전체 잠금 여부는 회원도 알아야 하므로 값만 알려주는 함수로 공개 (설정 표 자체는 관리자 전용 유지)
create or replace function public.chat_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true' from public.app_settings where key = 'chat_locked'), false);
$$;
revoke execute on function public.chat_locked() from public, anon;
grant execute on function public.chat_locked() to authenticated;

-- 새 메시지 검사: 잠금, 개인 제한, 도배. 어제 이전 대화와 접속 기록은 정리
create or replace function public.chat_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.chat_locked() and not public.is_admin() then
    raise exception '관리자가 채팅을 잠갔어요' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.profiles where id = new.user_id and chat_muted_until > now()
  ) then
    raise exception '채팅이 제한되어 있어요' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.chat_messages
    where user_id = new.user_id and created_at > now() - interval '10 seconds'
  ) >= 5 then
    raise exception '메시지를 너무 빨리 보내고 있어요' using errcode = 'P0001';
  end if;
  new.created_at := now();
  delete from public.chat_messages where created_at < public.kst_today_start();
  return new;
end;
$$;

-- 지금 남아 있는 어제 이전 대화 정리
delete from public.chat_messages where created_at < public.kst_today_start();

commit;

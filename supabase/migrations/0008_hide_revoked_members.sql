-- =====================================================================
-- 0008: 승인 취소(승인 대기로 돌아간) 회원의 기록 숨기기 + 관리자 "기록 전체 삭제" + 가입 거절
--  - 승인을 취소하면 그 회원의 1RM·네임드 WOD 기록(순위 포함), 명예의 벽 PR 글, 채팅, 만든 모임,
--    대회·모임 참가 명단이 다른 회원에게 보이지 않는다. 다시 승인하면 그대로 돌아온다. (DB가 강제)
--  - 관리자는 계속 볼 수 있고, admin_purge_member_records()로 완전히 지울 수 있다.
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- 이 사람이 지금 승인된 회원(또는 관리자)인지
create or replace function public.is_active_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = uid and role in ('member', 'admin'));
$$;
revoke execute on function public.is_active_member(uuid) from public, anon;
grant execute on function public.is_active_member(uuid) to authenticated;

-- 1RM·네임드 WOD 기록 (순위 뷰 one_rm_best도 이 규칙을 그대로 따른다)
drop policy if exists "one_rm: 회원 조회" on public.one_rm_records;
create policy "one_rm: 회원 조회 (승인 취소 회원 숨김)" on public.one_rm_records for select to authenticated
  using (
    public.is_member()
    and (public.is_admin() or user_id = (select auth.uid()) or public.is_active_member(user_id))
  );

-- 명예의 벽
drop policy if exists "activities: 회원 조회" on public.activities;
create policy "activities: 회원 조회 (승인 취소 회원 숨김)" on public.activities for select to authenticated
  using (
    public.is_member()
    and (public.is_admin() or user_id = (select auth.uid()) or public.is_active_member(user_id))
  );

-- 채팅 (오늘 대화)
drop policy if exists "chat: 회원이 오늘 대화 조회" on public.chat_messages;
create policy "chat: 회원이 오늘 대화 조회 (승인 취소 회원 숨김)" on public.chat_messages for select to authenticated
  using (
    public.is_member()
    and created_at >= public.kst_today_start()
    and (public.is_admin() or user_id = (select auth.uid()) or public.is_active_member(user_id))
  );

-- 회원이 만든 모임 (관리자가 만든 대회·이벤트는 그대로)
drop policy if exists "events: 회원 조회" on public.events;
create policy "events: 회원 조회 (승인 취소 회원의 모임 숨김)" on public.events for select to authenticated
  using (
    public.is_member()
    and (public.is_admin() or kind <> 'gathering' or created_by = (select auth.uid()) or public.is_active_member(created_by))
  );

-- 참가 명단
drop policy if exists "participants: 회원 조회" on public.event_participants;
create policy "participants: 회원 조회 (승인 취소 회원 숨김)" on public.event_participants for select to authenticated
  using (
    public.is_member()
    and (public.is_admin() or user_id = (select auth.uid()) or public.is_active_member(user_id))
  );

-- 정원 계산도 승인된 회원만 센다 (승인 취소된 사람이 자리를 차지하지 않게)
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
    select count(*) into taken
    from public.event_participants ep
    where ep.event_id = new.event_id and public.is_active_member(ep.user_id);
    if taken >= ev.capacity then
      raise exception '정원이 가득 찼습니다' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 관리자: 회원이 올린 기록 전체 삭제 (되돌릴 수 없음). 관리자 계정과 자기 자신은 대상이 아니다.
create or replace function public.admin_purge_member_records(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_rm integer;
  n_act integer;
  n_chat integer;
  n_ev integer;
  n_join integer;
  n_att integer;
begin
  if not public.is_admin() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if target = (select auth.uid()) or exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception '관리자 계정의 기록은 지울 수 없어요' using errcode = 'P0001';
  end if;
  delete from public.one_rm_records where user_id = target;  -- 연결된 PR 글도 함께 삭제
  get diagnostics n_rm = row_count;
  delete from public.activities where user_id = target;
  get diagnostics n_act = row_count;
  delete from public.chat_messages where user_id = target;
  get diagnostics n_chat = row_count;
  delete from public.events where created_by = target and kind = 'gathering';
  get diagnostics n_ev = row_count;
  delete from public.event_participants where user_id = target;
  get diagnostics n_join = row_count;
  delete from public.attendance where user_id = target;
  get diagnostics n_att = row_count;
  return jsonb_build_object(
    'oneRm', n_rm, 'activities', n_act, 'chat', n_chat,
    'gatherings', n_ev, 'participations', n_join, 'attendance', n_att
  );
end;
$$;
revoke execute on function public.admin_purge_member_records(uuid) from public, anon;
grant execute on function public.admin_purge_member_records(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 가입 거절: 관리자가 거절하면 'rejected'가 되어 승인 대기 목록에서 빠진다.
-- 거절된 사람은 스스로 다시 신청할 수 있다 (reapply_membership: rejected → pending 만 허용)
-- ---------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%pending%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'member', 'admin', 'rejected'));

create or replace function public.reapply_membership()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
begin
  update public.profiles set role = 'pending'
  where id = (select auth.uid()) and role = 'rejected'
  returning role into r;
  if r is null then
    raise exception '다시 신청할 수 없는 상태예요' using errcode = 'P0001';
  end if;
  return r;
end;
$$;
revoke execute on function public.reapply_membership() from public, anon;
grant execute on function public.reapply_membership() to authenticated;

commit;

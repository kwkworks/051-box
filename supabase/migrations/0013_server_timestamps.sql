-- =====================================================================
-- 0013: 등록 시각은 DB가 정한다 + 정원은 신청 인원보다 적게 못 줄인다 (2026-11-07 보안 점검)
--  * 하루 등록 제한(1RM 20개, 모임 5개)은 created_at으로 센다. 회원이 앱을 거치지 않고
--    created_at을 과거로 넣으면 제한을 피할 수 있어서, 넣는 값과 상관없이 지금 시각으로 고정한다.
--  * 참가자 목록 순서(created_at)도 같은 이유로 고정한다.
--  * 수정할 때도 처음 등록 시각은 바뀌지 않는다.
-- =====================================================================

create or replace function public.force_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists a_force_created_at on public.events;
create trigger a_force_created_at before insert or update on public.events
  for each row execute function public.force_created_at();

drop trigger if exists a_force_created_at on public.one_rm_records;
create trigger a_force_created_at before insert or update on public.one_rm_records
  for each row execute function public.force_created_at();

drop trigger if exists a_force_created_at on public.event_participants;
create trigger a_force_created_at before insert or update on public.event_participants
  for each row execute function public.force_created_at();

-- 정원을 이미 신청한 인원보다 적게 줄이지 못하게 (앱을 거치지 않는 수정도 막는다)
-- 주의: 처음엔 기존 참가 신청 함수와 같은 이름(check_event_capacity)으로 만들어 덮어쓰는 실수가 있었다 → 0014에서 바로잡음
create or replace function public.check_event_capacity_shrink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if new.capacity is not null and new.capacity is distinct from old.capacity then
    select count(*) into n from public.event_participants where event_id = new.id;
    if n > new.capacity then
      raise exception '정원은 이미 신청한 인원보다 적게 할 수 없어요' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_event_capacity_shrink() from public, anon, authenticated;

drop trigger if exists events_capacity_check on public.events;
create trigger events_capacity_check before update on public.events
  for each row execute function public.check_event_capacity_shrink();

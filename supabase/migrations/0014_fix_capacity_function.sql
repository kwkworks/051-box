-- =====================================================================
-- 0014: 0013 실수 바로잡기 (2026-11-07)
--  0013에서 만든 "정원 줄이기 검사" 함수가 이미 있던 참가 신청 정원 검사 함수
--  public.check_event_capacity()와 이름이 같아 덮어썼다. 그 결과 참가 신청이 모두 실패했다.
--  1) 참가 신청 정원 검사 함수를 0008의 내용으로 되돌리고
--  2) 정원 줄이기 검사는 다른 이름(check_event_capacity_shrink)으로 만들어 events에만 연결한다.
-- =====================================================================

-- 1) 참가 신청 정원 검사 (0008과 같은 내용): 마감·정원, 승인된 회원만 센다
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

-- 2) 정원을 이미 신청한 인원보다 적게 줄이지 못하게 (events 수정용, 새 이름)
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
    select count(*) into n
    from public.event_participants ep
    where ep.event_id = new.id and public.is_active_member(ep.user_id);
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

-- =====================================================================
-- 0030: 대회 접수 시작일 (2026-11-25)
--  대회 모집글에 접수 시작 · 접수 마감 · 대회일을 모두 적을 수 있게 접수 시작 시각을 더한다.
--  접수 시작 전에는 참가 신청을 받지 않는다 (DB가 직접 막는다). 비워 두면 지금처럼 바로 신청 가능.
-- 0029까지 적용된 뒤 실행한다.
-- =====================================================================

begin;

alter table public.events add column if not exists signup_opens_at timestamptz;

-- 접수 시작은 접수 마감·대회일보다 앞이어야 한다
alter table public.events drop constraint if exists events_signup_opens_order;
alter table public.events add constraint events_signup_opens_order check (
  signup_opens_at is null
  or ((signup_deadline is null or signup_opens_at <= signup_deadline) and signup_opens_at <= starts_at)
);

-- 참가 신청 검사 (0016 내용 그대로 + 접수 시작 전 차단)
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
  if ev.closed_at is not null then
    raise exception '신청이 마감되었습니다' using errcode = 'P0001';
  end if;
  if ev.signup_opens_at is not null and now() < ev.signup_opens_at then
    raise exception '아직 접수 기간이 아니에요' using errcode = 'P0001';
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

commit;

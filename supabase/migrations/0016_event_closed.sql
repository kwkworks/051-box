-- =====================================================================
-- 0016: 모임·대회 "신청 마감" 상태 (2026-11-13)
--  * events.closed_at: 만든 사람(모임) 또는 관리자가 마감하면 그 시각, 다시 받으면 null.
--    신청 마감일(signup_deadline)과 따로 둔다 → 마감했다 풀어도 원래 마감일이 그대로 남는다.
--  * 누가 바꿀 수 있는지는 기존 events 수정 정책(RLS: 작성자 또는 관리자)을 그대로 따른다.
--  * 참가 신청 검사 함수 check_event_capacity()는 일부러 고친다: 0014 내용 그대로 + 마감 상태 확인 한 줄.
-- 0015까지 적용된 뒤 실행한다.
-- =====================================================================

alter table public.events add column if not exists closed_at timestamptz;

-- 참가 신청 검사 (0014와 같음 + closed_at 확인)
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

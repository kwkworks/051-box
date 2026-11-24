-- =====================================================================
-- 0029: Max Rep(최대 반복 횟수) 기록 (2026-11-24)
--  1RM 기록에 세 번째 종류 'reps'를 더한다: 시간(분) 선택 + 종목 직접 입력 + 횟수.
--   예) 1분 버피 50회, 2분 더블언더 180회, 제한 없음(한 번에) 풀업 25회
--  - minutes: 0~60 (0 = 시간 제한 없음, 한 번에 끊지 않고)
--  - 같은 종목이라도 시간이 다르면 다른 기록으로 본다 (1분 버피 ≠ 3분 버피)
--  - 더 많이 하면 PR → 명예의 벽 (무게·시간 기록과 같은 방식)
-- 0028까지 적용된 뒤 실행한다.
-- =====================================================================

begin;

-- 1) 기록 종류에 'reps' 추가
alter table public.one_rm_records drop constraint if exists one_rm_records_unit_check;
alter table public.one_rm_records add constraint one_rm_records_unit_check check (unit in ('lb', 'time', 'reps'));

-- 2) 횟수와 시간(분)
alter table public.one_rm_records add column if not exists reps integer check (reps between 1 and 9999);
alter table public.one_rm_records add column if not exists minutes smallint check (minutes between 0 and 60);

-- 3) 종류마다 필요한 값만 (Max Rep은 종목을 직접 입력하므로 is_custom)
alter table public.one_rm_records drop constraint if exists one_rm_value_matches_unit;
alter table public.one_rm_records add constraint one_rm_value_matches_unit check (
  (unit = 'lb' and weight_lb is not null and weight_lb > 0 and weight_lb <= 1200 and time_sec is null and reps is null and minutes is null)
  or (unit = 'time' and time_sec is not null and weight_lb is null and reps is null and minutes is null)
  or (unit = 'reps' and is_custom and reps is not null and minutes is not null and weight_lb is null and time_sec is null)
);

drop index if exists public.one_rm_user_movement_idx;
create index one_rm_user_movement_idx on public.one_rm_records (user_id, movement, unit, minutes);

-- 4) 사람별·종목별 최고 기록: 무게는 무거운 것, 시간은 빠른 것, 횟수는 많은 것 (Max Rep은 시간(분)마다 따로)
drop view public.one_rm_best;
create view public.one_rm_best
with (security_invoker = true)
as
  select distinct on (r.user_id, r.movement, r.unit, coalesce(r.minutes, -1))
    r.user_id, r.movement, r.is_custom, r.unit, r.weight_lb, r.time_sec, r.reps, r.minutes, r.achieved_on, p.nickname, p.gender
  from public.one_rm_records r
  join public.profiles p on p.id = r.user_id
  order by r.user_id, r.movement, r.unit, coalesce(r.minutes, -1),
    case
      when r.unit = 'time' then r.time_sec::numeric
      when r.unit = 'reps' then -r.reps::numeric
      else -r.weight_lb
    end,
    r.achieved_on desc;
revoke all on public.one_rm_best from anon, authenticated;
grant select on public.one_rm_best to authenticated;

-- 5) PR 자동 게시: 무게는 더 무거우면, 시간은 더 빠르면, 횟수는 더 많으면 (그 종목 첫 기록도 PR)
create or replace function public.record_pr()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev_lb numeric;
  prev_sec integer;
  prev_reps integer;
begin
  if new.unit = 'time' then
    select min(time_sec) into prev_sec
    from public.one_rm_records
    where user_id = new.user_id and movement = new.movement and unit = 'time' and id <> new.id;
    if prev_sec is null or new.time_sec < prev_sec then
      insert into public.activities (user_id, kind, payload, one_rm_id)
      values (
        new.user_id, 'pr',
        jsonb_build_object(
          'movement', new.movement, 'is_custom', new.is_custom, 'unit', 'time',
          'time_sec', new.time_sec, 'prev_sec', prev_sec
        ),
        new.id
      );
    end if;
  elsif new.unit = 'reps' then
    select max(reps) into prev_reps
    from public.one_rm_records
    where user_id = new.user_id and movement = new.movement and unit = 'reps' and minutes = new.minutes and id <> new.id;
    if prev_reps is null or new.reps > prev_reps then
      insert into public.activities (user_id, kind, payload, one_rm_id)
      values (
        new.user_id, 'pr',
        jsonb_build_object(
          'movement', new.movement, 'is_custom', true, 'unit', 'reps',
          'reps', new.reps, 'minutes', new.minutes, 'prev_reps', prev_reps
        ),
        new.id
      );
    end if;
  else
    select max(weight_lb) into prev_lb
    from public.one_rm_records
    where user_id = new.user_id and movement = new.movement and unit = 'lb' and id <> new.id;
    if prev_lb is null or new.weight_lb > prev_lb then
      insert into public.activities (user_id, kind, payload, one_rm_id)
      values (
        new.user_id, 'pr',
        jsonb_build_object(
          'movement', new.movement, 'is_custom', new.is_custom, 'unit', 'lb',
          'weight_lb', new.weight_lb, 'prev_lb', prev_lb
        ),
        new.id
      );
    end if;
  end if;
  return new;
end;
$$;

commit;

-- =====================================================================
-- 0007: 무게는 파운드(lb)로, 네임드 WOD(Hero WOD)는 시간으로 기록
--  - 기존 기록은 kg으로 입력된 것이므로 파운드로 변환해 저장 (1 kg = 2.20462 lb, 소수 첫째 자리)
--  - 기록마다 단위(unit)가 있다: 'lb'(무게, 클수록 좋음) 또는 'time'(초, 짧을수록 좋음)
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- 1. 무게: weight_kg → weight_lb
alter table public.one_rm_records add column weight_lb numeric(6, 1);
update public.one_rm_records set weight_lb = round(weight_kg * 2.20462, 1);

-- 2. 시간 기록
alter table public.one_rm_records add column unit text not null default 'lb' check (unit in ('lb', 'time'));
alter table public.one_rm_records add column time_sec integer check (time_sec between 1 and 86400);
alter table public.one_rm_records add constraint one_rm_value_matches_unit check (
  (unit = 'lb' and weight_lb is not null and weight_lb > 0 and weight_lb <= 1200 and time_sec is null)
  or (unit = 'time' and time_sec is not null and weight_lb is null)
);

-- 3. 종목 목록 (직접 입력이 아니면 이 안에서만): 리프트는 무게, 네임드 WOD는 시간
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.one_rm_records'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%back_squat%'
  loop
    execute format('alter table public.one_rm_records drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.one_rm_records add constraint one_rm_known_movement check (
  is_custom
  or (unit = 'lb' and movement in (
    'back_squat', 'front_squat', 'overhead_squat', 'deadlift', 'clean', 'power_clean',
    'clean_and_jerk', 'snatch', 'power_snatch', 'push_press', 'strict_press', 'bench_press', 'thruster'
  ))
  or (unit = 'time' and movement in (
    'fran', 'grace', 'isabel', 'helen', 'diane', 'elizabeth', 'annie', 'jackie', 'karen',
    'nancy', 'kelly', 'amanda', 'murph', 'dt', 'jt'
  ))
);

drop view public.one_rm_best;
drop index if exists public.one_rm_user_movement_idx;
alter table public.one_rm_records drop column weight_kg;
create index one_rm_user_movement_idx on public.one_rm_records (user_id, movement, unit);

-- 사람별, 종목별 최고 기록 (무게는 무거운 것, 시간은 빠른 것). security_invoker로 조회자의 RLS를 그대로 적용
create view public.one_rm_best
with (security_invoker = true)
as
  select distinct on (r.user_id, r.movement, r.unit)
    r.user_id, r.movement, r.is_custom, r.unit, r.weight_lb, r.time_sec, r.achieved_on, p.nickname
  from public.one_rm_records r
  join public.profiles p on p.id = r.user_id
  order by r.user_id, r.movement, r.unit,
    case when r.unit = 'time' then r.time_sec::numeric else -r.weight_lb end,
    r.achieved_on desc;
revoke all on public.one_rm_best from anon, authenticated;
grant select on public.one_rm_best to authenticated;

-- 4. 기존 PR 축하 글의 무게도 파운드로
update public.activities
set payload = (payload - 'weight_kg' - 'prev_kg')
  || jsonb_build_object(
       'unit', 'lb',
       'weight_lb', round((payload ->> 'weight_kg')::numeric * 2.20462, 1),
       'prev_lb', case when payload ->> 'prev_kg' is null then null
                       else round((payload ->> 'prev_kg')::numeric * 2.20462, 1) end
     )
where kind = 'pr' and payload ? 'weight_kg';

-- 5. PR 자동 게시: 무게는 더 무거우면, 시간은 더 빠르면 (그 종목 첫 기록도 PR)
create or replace function public.record_pr()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev_lb numeric;
  prev_sec integer;
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

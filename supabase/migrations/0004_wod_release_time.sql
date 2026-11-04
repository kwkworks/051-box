-- =====================================================================
-- 0004: WOD 공개 시각
-- 지난 WOD와 오늘 WOD는 언제든 볼 수 있고, 다음 날 WOD는 전날 오후 8시 30분(한국 시간)부터 공개한다.
-- 그보다 먼 미래 WOD와 공개 전 WOD는 관리자만 본다. API를 우회해도 DB(RLS)가 막는다.
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- 이 날짜의 WOD를 지금 회원에게 보여도 되는지
create or replace function public.wod_visible(d date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select d <= public.kst_today()
      or (d = public.kst_today() + 1 and (now() at time zone 'Asia/Seoul')::time >= time '20:30');
$$;
revoke execute on function public.wod_visible(date) from public, anon;
grant execute on function public.wod_visible(date) to authenticated;

drop policy if exists "wods: 회원 조회" on public.wods;
create policy "wods: 회원 조회 (공개된 날짜만)" on public.wods for select to authenticated
  using (public.is_member() and (public.is_admin() or public.wod_visible(wod_date)));

-- 기록 사진도 WOD를 볼 수 있을 때만 (wods의 RLS가 그대로 적용된다)
drop policy if exists "wod_photos: 회원 조회" on public.wod_photos;
create policy "wod_photos: 회원 조회 (공개된 WOD만)" on public.wod_photos for select to authenticated
  using (public.is_member() and exists (select 1 from public.wods w where w.id = wod_id));

commit;

-- =====================================================================
-- 0009: 성별 (박스 순위를 남/여로 나눠 보기 위해). 본인이 프로필에서 고른다 (선택 안 함 가능)
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

alter table public.profiles add column gender text check (gender in ('M', 'F'));
grant update (gender) on public.profiles to authenticated;

-- 순위 뷰에 성별을 함께 (규칙은 0007·0008과 같음: 승인 취소 회원은 RLS로 숨김)
drop view public.one_rm_best;
create view public.one_rm_best
with (security_invoker = true)
as
  select distinct on (r.user_id, r.movement, r.unit)
    r.user_id, r.movement, r.is_custom, r.unit, r.weight_lb, r.time_sec, r.achieved_on, p.nickname, p.gender
  from public.one_rm_records r
  join public.profiles p on p.id = r.user_id
  order by r.user_id, r.movement, r.unit,
    case when r.unit = 'time' then r.time_sec::numeric else -r.weight_lb end,
    r.achieved_on desc;
revoke all on public.one_rm_best from anon, authenticated;
grant select on public.one_rm_best to authenticated;

commit;

-- =====================================================================
-- 0018: 축하해요 🎉 알림 (2026-11-13)
--  누군가 내 PR 글에 "축하해요"를 누르면 글 주인에게 알림을 보낸다.
--  push_claim_cheer(): 받을 기기 목록을 준다. 아래를 모두 만족할 때만:
--   * 서버 비밀값(PUSH_SECRET)이 맞을 때
--   * 그 사람이 실제로 그 글을 축하했을 때 (activity_likes에 있음)
--   * 자기 글을 스스로 축하한 게 아닐 때
--   * 같은 사람·같은 글 알림이 처음일 때 (눌렀다 취소했다 반복해도 한 번만, private.push_log)
--   * 글 주인이 승인된 회원이고 "🎉 내 PR 축하" 알림을 끄지 않았을 때 (notify_prefs.cheer, 기본 켬)
-- 0017까지 적용된 뒤 실행한다.
-- =====================================================================

create or replace function public.push_claim_cheer(p_secret text, p_activity uuid, p_liker uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  perform private.check_push_secret(p_secret);
  select a.user_id into owner from public.activities a where a.id = p_activity;
  if owner is null or owner = p_liker then
    return;
  end if;
  if not exists (
    select 1 from public.activity_likes l where l.activity_id = p_activity and l.user_id = p_liker
  ) then
    return;
  end if;
  insert into private.push_log (kind, ref) values ('cheer', left(p_activity::text || ':' || p_liker::text, 100))
    on conflict do nothing;
  if not found then
    return; -- 이미 보낸 알림
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.user_id = owner
      and p.role in ('member', 'admin')
      and coalesce((p.notify_prefs ->> 'cheer')::boolean, true);
end;
$$;
revoke execute on function public.push_claim_cheer(text, uuid, uuid) from public;
grant execute on function public.push_claim_cheer(text, uuid, uuid) to anon, authenticated;

-- =====================================================================
-- 0015: 회원 탈퇴 + 가입 요청 알림 (2026-11-11)
--  1) delete_my_account(): 로그인한 본인 계정을 지운다. 프로필·기록·채팅·참가 신청·알림 구독이
--     모두 함께 지워진다(외래 키 on delete cascade). 관리자 계정은 실수로 지우지 않게 막는다.
--  2) push_claim_signup(): 새 가입 요청(승인 대기)이 오면 "가입 요청 알림"을 켠 관리자 기기 목록을 준다.
--     서버 비밀값(PUSH_SECRET)이 맞아야 하고, 대상이 실제로 승인 대기일 때만, 같은 요청은 한 번만 보낸다.
-- 0014까지 적용된 뒤 실행한다.
-- =====================================================================

-- 1) 회원 탈퇴 (본인만)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  my_role text;
begin
  if uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  select role into my_role from public.profiles where id = uid;
  if my_role = 'admin' then
    raise exception '관리자 계정은 탈퇴할 수 없어요. 다른 관리자에게 권한을 넘긴 뒤 다시 시도해주세요' using errcode = 'P0001';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 2) 가입 요청 알림: 받을 관리자 기기 목록
create or replace function public.push_claim_signup(p_secret text, p_user uuid, p_ref text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  -- 실제로 승인 대기 중인 사람에 대해서만 보낸다
  if not exists (select 1 from public.profiles where id = p_user and role = 'pending') then
    return;
  end if;
  insert into private.push_log (kind, ref) values ('signup', left(p_ref, 100)) on conflict do nothing;
  if not found then
    return; -- 이미 보낸 알림
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.role = 'admin'
      and coalesce((p.notify_prefs ->> 'signup')::boolean, true);
end;
$$;
revoke execute on function public.push_claim_signup(text, uuid, text) from public;
grant execute on function public.push_claim_signup(text, uuid, text) to anon, authenticated;

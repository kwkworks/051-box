-- =====================================================================
-- 0010: 푸시 알림 (공지사항 · 대회·이벤트 · 회원 모임 · 내일 WOD 공개) + 기록 사진 순서
--  - 회원은 기기마다 알림을 구독하고, 종류별로 켜고 끈다 (profiles.notify_prefs)
--  - 보내는 쪽(서버)은 service_role 키 없이, 서버만 아는 비밀값으로 "받을 사람 목록"을 받는다.
--    비밀값은 해시로만 저장한다 (private.settings, 앱에서 접근 불가)
--  - 같은 알림(종류+대상)은 한 번만 보낸다 (private.push_log)
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- 앱(API)에서 보이지 않는 내부 저장소
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);
create table if not exists private.push_log (
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  primary key (kind, ref)
);

-- 1. 알림 구독 (기기마다 하나)
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 20 and 200),
  auth        text not null check (char_length(auth) between 10 and 100),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push: 본인 구독 조회" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push: 본인 구독 해제" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- 구독 등록은 이 함수로만 (같은 기기를 다른 계정이 쓰면 새 계정으로 옮긴다)
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = (select auth.uid())) >= 10 then
    delete from public.push_subscriptions
    where id = (select id from public.push_subscriptions where user_id = (select auth.uid()) order by created_at limit 1);
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth);
end;
$$;
revoke execute on function public.push_subscribe(text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text) to authenticated;

-- 2. 종류별 알림 설정 (기본: 모두 켬)
alter table public.profiles add column notify_prefs jsonb not null
  default '{"wod": true, "notices": true, "competition": true, "gathering": true}'::jsonb
  check (jsonb_typeof(notify_prefs) = 'object');
grant update (notify_prefs) on public.profiles to authenticated;

-- 3. 서버 전용: 비밀값 확인
create or replace function private.check_push_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select value into expected from private.settings where key = 'push_secret_sha256';
  if expected is null or p_secret is null
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> expected then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
end;
$$;

-- 받을 사람 목록: 처음 보내는 알림일 때만 (종류+대상 기준 한 번), 설정을 켠 승인 회원, 만든 사람 제외
create or replace function public.push_claim(p_secret text, p_kind text, p_ref text, p_actor uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  if p_kind not in ('wod', 'notices', 'competition', 'gathering') then
    raise exception '알 수 없는 알림 종류' using errcode = 'P0001';
  end if;
  insert into private.push_log (kind, ref) values (p_kind, left(p_ref, 100)) on conflict do nothing;
  if not found then
    return; -- 이미 보낸 알림
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.role in ('member', 'admin')
      and coalesce((p.notify_prefs ->> p_kind)::boolean, true)
      and (p_actor is null or s.user_id <> p_actor);
end;
$$;

-- 테스트 알림: 본인 기기 목록
create or replace function public.push_targets_for_user(p_secret text, p_user uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s where s.user_id = p_user;
end;
$$;

-- 만료된 구독 정리 (푸시 서비스가 "없는 구독"이라고 답하면)
create or replace function public.push_remove(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- 내일 WOD 제목 (있으면). 알림 문구용
create or replace function public.push_wod_tomorrow(p_secret text)
returns table (wod_date date, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  return query select w.wod_date, w.title from public.wods w where w.wod_date = public.kst_today() + 1;
end;
$$;

-- 서버는 로그인 없이(공개 키로) 부르므로 anon에게도 실행 권한을 주되, 비밀값이 맞아야만 동작한다
revoke execute on function private.check_push_secret(text) from public;
revoke execute on function public.push_claim(text, text, text, uuid) from public;
revoke execute on function public.push_targets_for_user(text, uuid) from public;
revoke execute on function public.push_remove(text, text) from public;
revoke execute on function public.push_wod_tomorrow(text) from public;
grant execute on function public.push_claim(text, text, text, uuid) to anon, authenticated;
grant execute on function public.push_targets_for_user(text, uuid) to anon, authenticated;
grant execute on function public.push_remove(text, text) to anon, authenticated;
grant execute on function public.push_wod_tomorrow(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- (함께) 기록 사진 순서: 관리자가 순서를 바꿀 수 있게
-- ---------------------------------------------------------------------
alter table public.wod_photos add column sort_order integer not null default 0;
update public.wod_photos p set sort_order = x.rn
from (select id, row_number() over (partition by wod_id order by created_at) as rn from public.wod_photos) x
where x.id = p.id;
create policy "wod_photos: 관리자 순서 변경" on public.wod_photos for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant update (sort_order) on public.wod_photos to authenticated;

commit;

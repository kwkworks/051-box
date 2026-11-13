-- =====================================================================
-- 0020: 네이버 카페 ↔ 앱 공지 연동 (2026-11-13)
--  A. 카페 → 앱: 카페 글을 앱 공지로 가져올 때 원문 주소(cafe_url)를 남긴다. 같은 카페 글은 한 번만.
--  B. 앱 → 카페: 관리자가 "네이버 카페 연결"을 한 번 하면, 공지를 쓸 때 카페에도 함께 올린다.
--     네이버 연결 정보(토큰)는 private 스키마에만 두고, 서버 비밀값(PUSH_SECRET)이 있어야 읽고 쓸 수 있다.
--     회원·관리자 화면에서는 "연결됨/안 됨"만 볼 수 있고 토큰 자체는 절대 내려가지 않는다.
-- 0019까지 적용된 뒤 실행한다.
-- =====================================================================

-- A/B 공통: 공지의 카페 원문 주소 (https://cafe.naver.com/crossfit051/글번호 형식만)
alter table public.notices add column if not exists cafe_url text
  check (cafe_url is null or cafe_url ~ '^https://cafe\.naver\.com/crossfit051/[0-9]{1,12}$');
create unique index if not exists notices_cafe_url_key on public.notices (cafe_url) where cafe_url is not null;

-- B: 네이버 연결 (서버 전용)
create table if not exists private.naver_oauth_states (
  state       text primary key,
  admin_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table if not exists private.naver_token (
  id             boolean primary key default true check (id), -- 한 줄만
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  connected_by   uuid references public.profiles (id) on delete set null,
  connected_at   timestamptz not null default now()
);

-- 1) 관리자가 "연결" 버튼을 누르면: 10분짜리 일회용 state를 만든다 (위조 방지)
create or replace function public.naver_state_create()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
  delete from private.naver_oauth_states where created_at < now() - interval '10 minutes';
  insert into private.naver_oauth_states (state, admin_id) values (s, (select auth.uid()));
  return s;
end;
$$;
revoke all on function public.naver_state_create() from public, anon;
grant execute on function public.naver_state_create() to authenticated;

-- 2) 네이버에서 돌아오면(서버): state를 한 번만 쓰고 지운다. 맞으면 그 관리자 id
create or replace function public.naver_state_consume(p_secret text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
begin
  perform private.check_push_secret(p_secret);
  delete from private.naver_oauth_states
  where state = p_state and created_at > now() - interval '10 minutes'
  returning admin_id into who;
  return who;
end;
$$;

-- 3) 토큰 저장 / 읽기 / 지우기 (서버 전용)
create or replace function public.naver_token_save(p_secret text, p_access text, p_refresh text, p_expires_at timestamptz, p_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  insert into private.naver_token (id, access_token, refresh_token, expires_at, connected_by, connected_at)
  values (true, p_access, p_refresh, p_expires_at, p_by, now())
  on conflict (id) do update set
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    connected_by = coalesce(excluded.connected_by, private.naver_token.connected_by);
end;
$$;

create or replace function public.naver_token_get(p_secret text)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  return query select t.access_token, t.refresh_token, t.expires_at from private.naver_token t;
end;
$$;

create or replace function public.naver_token_clear(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  delete from private.naver_token;
end;
$$;

revoke execute on function public.naver_state_consume(text, text) from public;
revoke execute on function public.naver_token_save(text, text, text, timestamptz, uuid) from public;
revoke execute on function public.naver_token_get(text) from public;
revoke execute on function public.naver_token_clear(text) from public;
grant execute on function public.naver_state_consume(text, text) to anon, authenticated;
grant execute on function public.naver_token_save(text, text, text, timestamptz, uuid) to anon, authenticated;
grant execute on function public.naver_token_get(text) to anon, authenticated;
grant execute on function public.naver_token_clear(text) to anon, authenticated;

-- 4) 관리자 화면용: 연결 상태만 (토큰은 주지 않는다)
create or replace function public.naver_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있어요' using errcode = '42501';
  end if;
  return coalesce(
    (select jsonb_build_object('connected', true, 'connected_at', t.connected_at,
            'connected_by', (select p.nickname from public.profiles p where p.id = t.connected_by))
     from private.naver_token t),
    jsonb_build_object('connected', false)
  );
end;
$$;
revoke all on function public.naver_status() from public, anon;
grant execute on function public.naver_status() to authenticated;

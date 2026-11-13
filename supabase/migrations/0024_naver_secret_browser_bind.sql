-- =====================================================================
-- 0024: 네이버 연결 보안 강화 (2026-11-13)
--  1) 네이버 연결 정보(토큰)는 알림용 PUSH_SECRET이 아니라 네이버 전용 비밀값(NAVER_SECRET)으로만 읽고 쓴다.
--     알림 비밀값이 새어 나가도 네이버 연결은 안전하다.
--  2) "연결하기"를 누른 브라우저에서만 연결이 끝나게 한다.
--     서버가 그 브라우저에 일회용 표시(쿠키)를 남기고, 그 해시를 state에 묶어 둔다.
--     네이버에서 돌아올 때 같은 표시가 있어야만 연결된다 (연결 주소가 새어 나가도 남이 가로챌 수 없음).
-- 0023까지 적용된 뒤 실행한다.
-- 실행 뒤 private.settings에 'naver_secret_sha256'(NAVER_SECRET의 sha256 해시)을 넣어야 네이버 연결이 동작한다.
-- =====================================================================

-- 1) 네이버 전용 비밀값 확인
create or replace function private.check_naver_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select value into expected from private.settings where key = 'naver_secret_sha256';
  if expected is null or p_secret is null
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> expected then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.check_naver_secret(text) from public, anon, authenticated;

-- 토큰 저장 / 읽기 / 지우기: 네이버 전용 비밀값으로 바꾼다 (모양은 그대로)
create or replace function public.naver_token_save(p_secret text, p_access text, p_refresh text, p_expires_at timestamptz, p_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_naver_secret(p_secret);
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
  perform private.check_naver_secret(p_secret);
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
  perform private.check_naver_secret(p_secret);
  delete from private.naver_token where id = true;
end;
$$;

-- 2) 연결을 시작한 브라우저 표시
alter table private.naver_oauth_states add column if not exists browser_hash text;

-- 서버: 관리자 브라우저가 연결 주소를 처음 열 때 한 번만 그 브라우저 표시(해시)를 묶는다
create or replace function public.naver_state_start(p_secret text, p_state text, p_browser_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.check_naver_secret(p_secret);
  if p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update private.naver_oauth_states
  set browser_hash = p_browser_hash
  where state = p_state and browser_hash is null and created_at > now() - interval '10 minutes';
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- 서버: 네이버에서 돌아오면 state와 브라우저 표시가 모두 맞을 때만 한 번 쓰고 지운다. 맞으면 그 관리자 id
drop function if exists public.naver_state_consume(text, text);
create or replace function public.naver_state_consume(p_secret text, p_state text, p_browser_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid;
begin
  perform private.check_naver_secret(p_secret);
  delete from private.naver_oauth_states
  where state = p_state
    and browser_hash is not null
    and browser_hash = p_browser_hash
    and created_at > now() - interval '10 minutes'
  returning admin_id into who;
  return who;
end;
$$;

revoke execute on function public.naver_state_start(text, text, text) from public;
revoke execute on function public.naver_state_consume(text, text, text) from public;
grant execute on function public.naver_state_start(text, text, text) to anon, authenticated;
grant execute on function public.naver_state_consume(text, text, text) to anon, authenticated;

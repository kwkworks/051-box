-- =====================================================================
-- 0025: 네이버 "다시 연결" 때 연결 시각도 새로 (2026-11-13)
--  관리자가 다시 연결하면(p_by가 있음) connected_at을 지금으로 바꿔 화면의 "연결됨 · 시각"이 갱신되게 한다.
--  서버가 만료 전에 토큰만 새로 받을 때(p_by 없음)는 연결 시각과 연결한 사람을 그대로 둔다.
-- 0024까지 적용된 뒤 실행한다.
-- =====================================================================

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
    connected_by = coalesce(excluded.connected_by, private.naver_token.connected_by),
    connected_at = case when excluded.connected_by is not null then now() else private.naver_token.connected_at end;
end;
$$;

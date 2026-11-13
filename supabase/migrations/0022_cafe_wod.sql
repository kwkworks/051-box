-- =====================================================================
-- 0022: 오늘의 WOD → 네이버 카페 WOD 게시판 (2026-11-13)
--  * 매일 20:30 내일 WOD가 공개될 때, 관리자가 켜 두었으면(cafe_wod_autopost) 카페 WOD 게시판에도 올린다.
--  * 올린 카페 글 주소를 wods.cafe_url에 남겨 하루 한 번만 올라가게 한다.
--  * 서버는 로그인 없이 부르므로 서버 비밀값(PUSH_SECRET)이 맞아야만 동작한다 (0010과 같은 방식).
-- 0021까지 적용된 뒤 실행한다.
-- =====================================================================

-- 관리자 설정 항목에 'cafe_wod_autopost'(true/false) 추가
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('wod_sheet_url', 'chat_locked', 'cafe_wod_autopost'));

-- WOD의 카페 글 주소 (우리 카페 글만, 한 글은 한 번만)
alter table public.wods add column if not exists cafe_url text
  check (cafe_url is null or cafe_url ~ '^https://cafe\.naver\.com/crossfit051/[0-9]{1,12}$');
create unique index if not exists wods_cafe_url_key on public.wods (cafe_url) where cafe_url is not null;

-- 서버: 지금 카페에 올릴 내일 WOD (자동 등록이 켜져 있고, 아직 안 올렸을 때만)
create or replace function public.cafe_wod_pending(p_secret text)
returns table (wod_date date, title text, content text, lifts jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  if coalesce((select s.value from public.app_settings s where s.key = 'cafe_wod_autopost'), 'false') <> 'true' then
    return;
  end if;
  return query
    select w.wod_date, w.title, w.content, w.lifts
    from public.wods w
    where w.wod_date = public.kst_today() + 1 and w.cafe_url is null;
end;
$$;

-- 서버: 카페에 올린 뒤 주소 기록 (이미 기록돼 있으면 그대로)
create or replace function public.cafe_wod_mark(p_secret text, p_date date, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  update public.wods set cafe_url = p_url where wod_date = p_date and cafe_url is null;
end;
$$;

revoke execute on function public.cafe_wod_pending(text) from public;
revoke execute on function public.cafe_wod_mark(text, date, text) from public;
grant execute on function public.cafe_wod_pending(text) to anon, authenticated;
grant execute on function public.cafe_wod_mark(text, date, text) to anon, authenticated;

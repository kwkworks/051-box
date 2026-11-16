-- =====================================================================
-- 0026: 박스 채팅 고정 공지 (2026-11-16)
--  관리자가 정한 문구(예: 닉네임 규칙)를 채팅창 맨 위에 📌로 고정해 들어온 회원 누구나 보게 한다.
--  쓰기: 관리자만 (기존 app_settings RLS). 읽기: 승인 회원은 이 문구 하나만 함수로 읽는다 (다른 설정은 그대로 관리자만).
-- 0025까지 적용된 뒤 실행한다.
-- =====================================================================

alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('wod_sheet_url', 'chat_locked', 'cafe_wod_autopost', 'chat_notice'));

-- 고정 공지는 200자까지
alter table public.app_settings drop constraint if exists app_settings_chat_notice_len;
alter table public.app_settings add constraint app_settings_chat_notice_len
  check (key <> 'chat_notice' or char_length(value) <= 200);

-- 승인 회원: 채팅 고정 공지 읽기 (없으면 null)
create or replace function public.chat_notice()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_member()
    then (select nullif(btrim(s.value), '') from public.app_settings s where s.key = 'chat_notice')
  end;
$$;
revoke execute on function public.chat_notice() from public, anon;
grant execute on function public.chat_notice() to authenticated;

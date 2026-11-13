-- =====================================================================
-- 0021: 네이버 카페 "연결 끊기" 오류 수정 (2026-11-13)
--  Supabase는 실수로 표 전체를 지우지 않도록 WHERE 없는 DELETE를 막는다(safeupdate).
--  0020의 naver_token_clear()가 "delete from private.naver_token;" 이라 거부되어 연결 끊기가 서버 오류가 났다.
--  일부러 같은 함수를 고친다: 내용은 0020과 같고 삭제에 조건(id = true, 한 줄뿐인 표)만 붙인다.
-- 0020이 적용된 뒤 실행한다.
-- =====================================================================

create or replace function public.naver_token_clear(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_push_secret(p_secret);
  delete from private.naver_token where id = true;
end;
$$;
revoke execute on function public.naver_token_clear(text) from public;
grant execute on function public.naver_token_clear(text) to anon, authenticated;

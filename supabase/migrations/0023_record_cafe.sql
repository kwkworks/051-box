-- =====================================================================
-- 0023: 기록 사진 → 네이버 카페 RECORD 게시판 (2026-11-13)
--  관리자가 WOD 화면에서 "카페 RECORD에 올리기"를 누르면 그날 기록 사진을 첨부해 카페에 올리고,
--  올린 카페 글 주소를 남겨 같은 날 기록이 두 번 올라가지 않게 한다. (수정 권한은 기존 wods RLS: 관리자만)
-- 0022까지 적용된 뒤 실행한다.
-- =====================================================================

alter table public.wods add column if not exists record_cafe_url text
  check (record_cafe_url is null or record_cafe_url ~ '^https://cafe\.naver\.com/crossfit051/[0-9]{1,12}$');
create unique index if not exists wods_record_cafe_url_key on public.wods (record_cafe_url) where record_cafe_url is not null;

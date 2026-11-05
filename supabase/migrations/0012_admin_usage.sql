-- 0012: 관리자가 무료 플랜 용량(DB 500MB, 파일 1GB)을 얼마나 쓰는지 보는 함수
-- 관리자만 실행할 수 있고, 숫자(크기, 개수)만 돌려준다.
create or replace function public.admin_usage()
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
  return jsonb_build_object(
    'db_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'storage_bytes', coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0),
    'photo_count', (select count(*) from storage.objects o where o.bucket_id = 'wod-photos')
  );
end;
$$;

revoke all on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;

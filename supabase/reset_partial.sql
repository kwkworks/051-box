-- 0001_init.sql이 중간까지만 적용됐을 때 정리용 (데이터가 없는 새 프로젝트에서만 사용)
drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists "wod-photos: 회원 열람" on storage.objects;
drop policy if exists "wod-photos: 관리자 업로드" on storage.objects;
drop policy if exists "wod-photos: 관리자 삭제" on storage.objects;
drop policy if exists "box-space: 회원 수신" on realtime.messages;
drop policy if exists "box-space: 회원 송신" on realtime.messages;
drop view if exists public.one_rm_best;
drop table if exists public.activities, public.one_rm_records, public.event_participants, public.events,
  public.notices, public.attendance, public.holidays, public.wod_photos, public.wods, public.profiles cascade;
drop function if exists public.kst_today(), public.set_updated_at(), public.is_member(), public.is_admin(),
  public.handle_new_user(), public.protect_profile(), public.my_streak(), public.check_event_capacity(),
  public.record_pr() cascade;

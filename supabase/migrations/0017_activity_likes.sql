-- =====================================================================
-- 0017: PR 명예의 벽 축하해요 🎉 (2026-11-13)
--  * 승인된 회원이 명예의 벽 글(activities)에 "축하해요"를 누른다 (표 이름은 activity_likes). 한 사람이 한 글에 한 번 (다시 누르면 취소).
--  * 본인 글에도 누를 수 있다. 알림은 보내지 않는다.
--  * 글이 지워지거나(PR 기록 삭제) 회원이 탈퇴하면 축하도 함께 지워진다.
--  * 남의 이름으로 누르거나 남의 축하를 지울 수 없다 (RLS).
-- 0016까지 적용된 뒤 실행한다.
-- =====================================================================

create table if not exists public.activity_likes (
  activity_id  uuid not null references public.activities (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index if not exists activity_likes_user_idx on public.activity_likes (user_id);

alter table public.activity_likes enable row level security;

drop policy if exists "likes: 회원 조회" on public.activity_likes;
create policy "likes: 회원 조회" on public.activity_likes for select to authenticated
  using (public.is_member());

drop policy if exists "likes: 본인 이름으로 누르기" on public.activity_likes;
create policy "likes: 본인 이름으로 누르기" on public.activity_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member());

drop policy if exists "likes: 본인 좋아요 취소" on public.activity_likes;
create policy "likes: 본인 좋아요 취소" on public.activity_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.activity_likes from anon, authenticated;
grant select, insert, delete on public.activity_likes to authenticated;

-- 누른 시각도 DB가 정한다 (0013과 같은 규칙)
drop trigger if exists a_force_created_at on public.activity_likes;
create trigger a_force_created_at before insert or update on public.activity_likes
  for each row execute function public.force_created_at();

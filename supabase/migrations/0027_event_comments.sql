-- =====================================================================
-- 0027: 회원 모임 댓글 (2026-11-22)
--  회원 모임(kind = 'gathering')에 승인 회원 누구나 댓글을 단다 (300자 이하).
--  삭제: 쓴 사람은 자기 댓글, 관리자는 모든 댓글 (댓글 관리). 수정은 없음.
-- 0026까지 적용된 뒤 실행한다.
-- =====================================================================

create table if not exists public.event_comments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index if not exists event_comments_event_idx on public.event_comments (event_id, created_at);

alter table public.event_comments enable row level security;

-- 읽기: 승인 회원
drop policy if exists "event_comments: 회원 조회" on public.event_comments;
create policy "event_comments: 회원 조회" on public.event_comments
  for select to authenticated using (public.is_member());

-- 쓰기: 승인 회원이 자기 이름으로, 회원 모임에만
drop policy if exists "event_comments: 회원 작성" on public.event_comments;
create policy "event_comments: 회원 작성" on public.event_comments
  for insert to authenticated
  with check (
    public.is_member()
    and user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.kind = 'gathering')
  );

-- 지우기: 쓴 사람 또는 관리자
drop policy if exists "event_comments: 본인·관리자 삭제" on public.event_comments;
create policy "event_comments: 본인·관리자 삭제" on public.event_comments
  for delete to authenticated
  using (public.is_member() and (user_id = (select auth.uid()) or public.is_admin()));

-- 수정 권한은 주지 않는다 (작성 시각·작성자 위조 방지). 쓰기는 event_id와 내용만
revoke all on public.event_comments from anon, authenticated;
grant select, delete on public.event_comments to authenticated;
grant insert (event_id, body) on public.event_comments to authenticated;

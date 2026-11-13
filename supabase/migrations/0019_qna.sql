-- =====================================================================
-- 0019: Q&A 문의 게시판 (2026-11-13)
--  * 승인된 회원이 관리자에게 문의를 남긴다 (1:1 문의).
--  * 문의는 쓴 사람 본인과 관리자만 볼 수 있다. 다른 회원에게는 보이지 않는다.
--  * 쓴 사람: 작성, 삭제 (내용 수정은 없음). 관리자: 모두 보기, 답변 달기·고치기, 삭제.
--  * 답변 시각·답변한 사람은 DB가 정한다. 하루 10개까지 (도배 방지, 0005 limit_daily_inserts).
--  * 탈퇴하면 그 사람의 문의도 함께 지워진다.
-- 0018까지 적용된 뒤 실행한다.
-- =====================================================================

create table if not exists public.qna_questions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  answer       text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
  answered_at  timestamptz,
  answered_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists qna_questions_user_idx on public.qna_questions (user_id, created_at desc);
create index if not exists qna_questions_created_idx on public.qna_questions (created_at desc);

alter table public.qna_questions enable row level security;

drop policy if exists "qna: 본인 또는 관리자 조회" on public.qna_questions;
create policy "qna: 본인 또는 관리자 조회" on public.qna_questions for select to authenticated
  using (public.is_admin() or (user_id = (select auth.uid()) and public.is_member()));

drop policy if exists "qna: 본인 이름으로 작성" on public.qna_questions;
create policy "qna: 본인 이름으로 작성" on public.qna_questions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member() and answer is null and answered_by is null);

drop policy if exists "qna: 관리자만 답변" on public.qna_questions;
create policy "qna: 관리자만 답변" on public.qna_questions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "qna: 본인 또는 관리자 삭제" on public.qna_questions;
create policy "qna: 본인 또는 관리자 삭제" on public.qna_questions for delete to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));

-- 쓸 수 있는 칸을 제한한다: 작성은 제목·내용만, 수정은 답변만
revoke all on public.qna_questions from anon, authenticated;
grant select, delete on public.qna_questions to authenticated;
grant insert (title, body) on public.qna_questions to authenticated;
grant update (answer) on public.qna_questions to authenticated;

-- 답변 시각·답변한 사람은 DB가 정한다 (답변을 지우면 함께 비운다)
create or replace function public.qna_stamp_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.answer is distinct from old.answer then
    if new.answer is null then
      new.answered_at := null;
      new.answered_by := null;
    else
      new.answered_at := now();
      new.answered_by := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists qna_stamp_answer on public.qna_questions;
create trigger qna_stamp_answer before update on public.qna_questions
  for each row execute function public.qna_stamp_answer();

-- 작성 시각은 DB가 정한다 (0013), 하루 10개까지 (0005)
drop trigger if exists a_force_created_at on public.qna_questions;
create trigger a_force_created_at before insert or update on public.qna_questions
  for each row execute function public.force_created_at();
drop trigger if exists qna_daily_cap on public.qna_questions;
create trigger qna_daily_cap before insert on public.qna_questions
  for each row execute function public.limit_daily_inserts('user_id', '10');

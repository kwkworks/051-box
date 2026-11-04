-- =====================================================================
-- 0002: PR 글과 1RM 기록 연결, 채팅 기록(7일), 구글 시트 설정
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 명예의 벽: PR 글을 원본 1RM 기록과 연결해서, 기록을 지우면 PR 글도 함께 지워지게 한다
-- ---------------------------------------------------------------------
alter table public.activities
  add column one_rm_id uuid references public.one_rm_records (id) on delete cascade;
create index activities_one_rm_idx on public.activities (one_rm_id);

-- 기존 PR 글을 가장 가까운 시각의 같은 기록과 연결
update public.activities a
set one_rm_id = (
  select r.id
  from public.one_rm_records r
  where r.user_id = a.user_id
    and r.movement = a.payload ->> 'movement'
    and r.weight_kg = (a.payload ->> 'weight_kg')::numeric
  order by abs(extract(epoch from (r.created_at - a.created_at)))
  limit 1
)
where a.kind = 'pr' and a.one_rm_id is null;

-- 원본 기록이 이미 지워진 PR 글 정리 (지금까지 남아 있던 문제 해결)
delete from public.activities where kind = 'pr' and one_rm_id is null;

create or replace function public.record_pr()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev_best numeric;
begin
  select max(weight_kg) into prev_best
  from public.one_rm_records
  where user_id = new.user_id and movement = new.movement and id <> new.id;

  if prev_best is not null and new.weight_kg > prev_best then
    insert into public.activities (user_id, kind, payload, one_rm_id)
    values (
      new.user_id, 'pr',
      jsonb_build_object(
        'movement', new.movement, 'is_custom', new.is_custom,
        'weight_kg', new.weight_kg, 'prev_kg', prev_best
      ),
      new.id
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 채팅 기록: 승인된 회원만, 최근 7일만 보이고 오래된 메시지는 자동 삭제
-- ---------------------------------------------------------------------
create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null
              check (char_length(btrim(body)) between 1 and 200
                     and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  created_at  timestamptz not null default now()
);
create index chat_messages_created_idx on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;
create policy "chat: 회원이 최근 7일 조회" on public.chat_messages for select to authenticated
  using (public.is_member() and created_at > now() - interval '7 days');
create policy "chat: 회원 본인 작성" on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_member());
create policy "chat: 본인 또는 관리자 삭제" on public.chat_messages for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.chat_messages from anon, authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

-- 도배 방지(10초에 5개까지) + 7일 지난 메시지 정리
create or replace function public.chat_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.chat_messages
    where user_id = new.user_id and created_at > now() - interval '10 seconds'
  ) >= 5 then
    raise exception '메시지를 너무 빨리 보내고 있어요' using errcode = 'P0001';
  end if;
  new.created_at := now();
  delete from public.chat_messages where created_at < now() - interval '7 days';
  return new;
end;
$$;

create trigger chat_messages_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

-- 새 메시지를 실시간으로 받을 수 있게 (받는 쪽에도 위 RLS가 그대로 적용된다)
alter publication supabase_realtime add table public.chat_messages;

-- ---------------------------------------------------------------------
-- 3. 앱 설정 (구글 시트 주소 등): 관리자만 읽고 쓴다
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key in ('wod_sheet_url')),
  value       text not null check (char_length(value) <= 500),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;
create policy "settings: 관리자 조회" on public.app_settings for select to authenticated using (public.is_admin());
create policy "settings: 관리자 작성" on public.app_settings for insert to authenticated with check (public.is_admin());
create policy "settings: 관리자 수정" on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.app_settings from anon, authenticated;
grant select, insert, update on public.app_settings to authenticated;

commit;

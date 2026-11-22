-- =====================================================================
-- 0028: Q&A 새 문의 알림 + 댓글 도배 방지 + 회원 대회 모집글·대회 댓글 (2026-11-22)
--  1) 회원이 Q&A 문의를 남기면 "Q&A 문의 알림"을 켠 관리자 기기에 푸시를 보낸다.
--  서버 비밀값(PUSH_SECRET)이 맞아야 하고, 실제로 있는 문의일 때만, 같은 문의는 한 번만, 쓴 사람 본인은 빼고.
--  알림에는 문의 내용을 넣지 않는다 (잠금 화면에 비공개 문의가 보이지 않게, 서버에서 처리).
--  2) 댓글은 한 사람이 1분에 5개, 하루 100개까지 (서버를 다시 켜도 유지되도록 DB에서 막는다).
--  3) 대회 모집글: 회원도 자기 이름으로 대회를 올리고 고치고 지울 수 있다 (이벤트는 그대로 관리자만).
--     승인 취소된 회원이 올린 대회는 모임처럼 숨긴다. 댓글은 모임과 대회 모두에 달 수 있다.
-- 0027까지 적용된 뒤 실행한다.
-- =====================================================================

create or replace function public.push_claim_qna(p_secret text, p_question uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  perform private.check_push_secret(p_secret);
  select q.user_id into author from public.qna_questions q where q.id = p_question;
  if author is null then
    return; -- 없는 문의
  end if;
  insert into private.push_log (kind, ref) values ('qna', p_question::text) on conflict do nothing;
  if not found then
    return; -- 이미 보낸 알림
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.role = 'admin'
      and p.id <> author
      and coalesce((p.notify_prefs ->> 'qna')::boolean, true);
end;
$$;
revoke execute on function public.push_claim_qna(text, uuid) from public;
grant execute on function public.push_claim_qna(text, uuid) to anon, authenticated;

-- 2) 댓글 도배 방지
create or replace function public.event_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.event_comments c
      where c.user_id = new.user_id and c.created_at > now() - interval '1 minute') >= 5 then
    raise exception '댓글을 너무 빨리 쓰고 있어요. 잠시 뒤에 다시 써 주세요' using errcode = 'P0001';
  end if;
  if (select count(*) from public.event_comments c
      where c.user_id = new.user_id and c.created_at > now() - interval '1 day') >= 100 then
    raise exception '오늘은 댓글을 더 쓸 수 없어요 (하루 100개까지)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.event_comments_before_insert() from public, anon, authenticated;

drop trigger if exists event_comments_rate_limit on public.event_comments;
create trigger event_comments_rate_limit
  before insert on public.event_comments
  for each row execute function public.event_comments_before_insert();

-- 3) 대회 모집글을 회원도 작성 (본인 이름으로만). 이벤트는 관리자만
drop policy if exists "events: 작성" on public.events;
create policy "events: 작성" on public.events for insert to authenticated
  with check (
    public.is_admin()
    or (kind in ('gathering', 'competition') and created_by = (select auth.uid()) and public.is_member())
  );

-- 고치기: 작성자 또는 관리자. 회원은 모임·대회로만 (이벤트로 바꾸기 금지)
drop policy if exists "events: 작성자 또는 관리자 수정" on public.events;
create policy "events: 작성자 또는 관리자 수정" on public.events for update to authenticated
  using (public.is_admin() or (created_by = (select auth.uid()) and public.is_member()))
  with check (public.is_admin() or (kind in ('gathering', 'competition') and created_by = (select auth.uid())));

-- 보기: 승인 취소된 회원이 올린 모임·대회는 숨긴다 (관리자가 올린 글과 이벤트는 그대로)
drop policy if exists "events: 회원 조회 (승인 취소 회원의 모임 숨김)" on public.events;
create policy "events: 회원 조회 (승인 취소 회원의 모임 숨김)" on public.events for select to authenticated
  using (
    public.is_member()
    and (public.is_admin() or kind = 'event' or created_by = (select auth.uid()) or public.is_active_member(created_by))
  );

-- 댓글: 모임과 대회에
drop policy if exists "event_comments: 회원 작성" on public.event_comments;
create policy "event_comments: 회원 작성" on public.event_comments
  for insert to authenticated
  with check (
    public.is_member()
    and user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.kind in ('gathering', 'competition'))
  );

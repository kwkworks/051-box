-- =====================================================================
-- 0006: 채팅을 "오늘(한국 시간 0시부터) 대화 전체"로 공개하고, 어디까지 읽었는지 기억한다
-- (0003의 "내가 박스에 있던 동안만" 규칙 때문에 휴대폰·PC 사이 대화가 끊겨 보여서 바꾼다)
-- 전체를 한 트랜잭션으로 실행한다.
-- =====================================================================

begin;

drop policy if exists "chat: 내가 있던 동안의 오늘 대화" on public.chat_messages;
create policy "chat: 회원이 오늘 대화 조회" on public.chat_messages for select to authenticated
  using (public.is_member() and created_at >= public.kst_today_start());

-- 어디까지 읽었는지 (휴대폰·PC 어디서 읽어도 같이 기억)
alter table public.profiles add column chat_read_at timestamptz;

-- 읽은 위치는 이 함수로만 바꾼다: 본인 것만, 앞으로만 (미래 시각은 지금으로 맞춤)
create or replace function public.chat_mark_read(at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  t timestamptz := least(at, now());
  result timestamptz;
begin
  if not public.is_member() then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  update public.profiles
  set chat_read_at = greatest(coalesce(chat_read_at, '-infinity'::timestamptz), t)
  where id = (select auth.uid())
  returning chat_read_at into result;
  return result;
end;
$$;
revoke execute on function public.chat_mark_read(timestamptz) from public, anon;
grant execute on function public.chat_mark_read(timestamptz) to authenticated;

commit;

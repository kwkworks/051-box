-- =====================================================================
-- 051 BOX 보안(RLS) 자동 테스트
-- SQL Editor에서 실행한다. 실제 사용자 권한으로 "막혀야 하는 요청"을 보내고 결과를 표로 보여준다.
-- 필요: 관리자 1명(admin) + 승인된 회원 1명(member). 승인 대기 계정은 테스트 중에 임시로 만들고 지운다.
-- 테스트로 만든 데이터는 마지막에 모두 삭제한다.
-- 31번 정확도를 위해, 실행하는 동안 테스트 회원 계정으로 앱에 접속해 있지 않아야 한다.
-- =====================================================================

-- 특정 사용자(또는 비로그인)로 쿼리를 실행하고 결과를 'ok:처리행수' 또는 'err:에러코드'로 돌려준다
create or replace function pg_temp.run_as(uid uuid, q text)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  begin
    if uid is null then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute 'set local role anon';
    else
      perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
    end if;
    execute q;
    get diagnostics n = row_count;
    execute 'reset role';
    return 'ok:' || n;
  exception when others then
    return 'err:' || sqlstate || ' ' || left(sqlerrm, 60);
  end;
end;
$$;

create temp table rls_results (no int, scenario text, expected text, actual text);

do $$
declare
  d uuid;  -- 관리자
  a uuid;  -- 승인된 회원
  c uuid := gen_random_uuid();  -- 임시 승인 대기 계정
  rm uuid;
  ev_full uuid;
  ev_closed uuid;
  dm uuid;     -- 관리자가 쓴 채팅
  rm_pr uuid;  -- 회원의 PR 기록
  dm2 uuid;    -- 회원이 접속한 뒤 관리자가 쓴 채팅
  rm_first uuid;
  lock_before text;
  r text;
begin
  select id into d from public.profiles where role = 'admin' order by created_at limit 1;
  select id into a from public.profiles where role = 'member' order by created_at limit 1;
  if d is null or a is null then
    raise exception '관리자 1명과 승인된 회원 1명이 필요합니다 (admin: %, member: %)', d, a;
  end if;

  -- 테스트 데이터 준비 (관리자 권한으로)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'rls-test@example.invalid', '{"name":"RLS테스트"}');
  insert into public.one_rm_records (user_id, movement, weight_kg) values (d, 'deadlift', 100) returning id into rm;
  insert into public.events (kind, title, starts_at, capacity, created_by)
    values ('gathering', 'RLS 테스트 정원', now() + interval '1 day', 1, d) returning id into ev_full;
  insert into public.events (kind, title, starts_at, signup_deadline, created_by)
    values ('competition', 'RLS 테스트 마감', now() + interval '1 day', now() - interval '1 hour', d) returning id into ev_closed;

  -- 실제 Realtime 서버는 접속을 검사할 때 채널 이름을 realtime.topic 설정으로 알려준다. 테스트도 똑같이 흉내 낸다.
  perform set_config('realtime.topic', 'box-space', true);

  insert into rls_results values
  (1, '비로그인 사용자가 회원 목록 조회', 'err', pg_temp.run_as(null, 'select * from public.profiles')),
  (2, '승인 대기자가 WOD 조회', 'ok:0', pg_temp.run_as(c, 'select * from public.wods')),
  (3, '승인 대기자는 다른 회원을 볼 수 없음 (본인만)', 'ok:1', pg_temp.run_as(c, 'select * from public.profiles')),
  (4, '승인 대기자가 출석 체크', 'err', pg_temp.run_as(c, 'insert into public.attendance default values')),
  (5, '회원이 자기 role을 admin으로 변경', 'err', pg_temp.run_as(a, format('update public.profiles set role = ''admin'' where id = %L', a))),
  (6, '회원이 관리자 닉네임 변경', 'ok:0', pg_temp.run_as(a, format('update public.profiles set nickname = ''해킹'' where id = %L', d))),
  (7, '회원이 WOD 작성', 'err', pg_temp.run_as(a, 'insert into public.wods (wod_date, title) values (current_date + 100, ''x'')')),
  (8, '회원이 대회 등록', 'err', pg_temp.run_as(a, format('insert into public.events (kind, title, starts_at, created_by) values (''competition'', ''x'', now(), %L)', a))),
  (9, '회원이 남의 이름으로 모임 등록', 'err', pg_temp.run_as(a, format('insert into public.events (kind, title, starts_at, created_by) values (''gathering'', ''x'', now(), %L)', d))),
  (10, '회원이 관리자의 1RM 기록 삭제', 'ok:0', pg_temp.run_as(a, format('delete from public.one_rm_records where id = %L', rm))),
  (11, '회원이 어제 날짜로 출석 위조', 'err', pg_temp.run_as(a, 'insert into public.attendance (attend_date) values (public.kst_today() - 1)')),
  (12, '회원이 명예의 벽(PR) 글 위조', 'err', pg_temp.run_as(a, format('insert into public.activities (user_id, kind) values (%L, ''pr'')', a))),
  (13, '정원 1명 모임에 첫 번째 신청', 'ok:1', pg_temp.run_as(a, format('insert into public.event_participants (event_id) values (%L)', ev_full))),
  (14, '정원이 찬 모임에 두 번째 신청', 'err', pg_temp.run_as(d, format('insert into public.event_participants (event_id) values (%L)', ev_full))),
  (15, '마감 지난 대회 신청', 'err', pg_temp.run_as(a, format('insert into public.event_participants (event_id) values (%L)', ev_closed))),
  (16, '회원이 기록 사진 업로드', 'err', pg_temp.run_as(a, 'insert into storage.objects (bucket_id, name) values (''wod-photos'', ''rls-test.jpg'')')),
  (17, '승인 대기자가 2D 공간 채널에 메시지 전송', 'err', pg_temp.run_as(c, 'insert into realtime.messages (topic, extension, payload, event, private) values (''box-space'', ''broadcast'', ''{}'', ''rls-test'', true)')),
  (18, '승인된 회원은 2D 공간 채널에 메시지 전송 가능', 'ok:1', pg_temp.run_as(a, 'insert into realtime.messages (topic, extension, payload, event, private) values (''box-space'', ''broadcast'', ''{}'', ''rls-test'', true)'));

  -- ---- 0002: 채팅, 앱 설정, PR 글 연동 삭제
  insert into public.chat_messages (user_id, body) values (d, 'rls-test 관리자 메시지') returning id into dm;
  insert into public.one_rm_records (user_id, movement, weight_kg) values (a, 'snatch', 50);
  insert into public.one_rm_records (user_id, movement, weight_kg) values (a, 'snatch', 55) returning id into rm_pr;

  insert into rls_results values
  (19, '승인 대기자가 채팅 기록 조회', 'ok:0', pg_temp.run_as(c, 'select * from public.chat_messages')),
  (20, '승인 대기자가 채팅 작성', 'err', pg_temp.run_as(c, 'insert into public.chat_messages (body) values (''rls-test'')')),
  (21, '회원이 남의 이름으로 채팅 작성', 'err', pg_temp.run_as(a, format('insert into public.chat_messages (user_id, body) values (%L, ''rls-test'')', d))),
  (22, '회원이 다른 회원의 채팅 삭제', 'ok:0', pg_temp.run_as(a, format('delete from public.chat_messages where id = %L', dm))),
  (23, '회원 본인 채팅 작성', 'ok:1', pg_temp.run_as(a, 'insert into public.chat_messages (body) values (''rls-test 회원 메시지'')')),
  (24, '회원이 앱 설정(시트 주소) 조회', 'ok:0', pg_temp.run_as(a, 'select * from public.app_settings')),
  (25, '회원이 시트 주소 바꾸기', 'err', pg_temp.run_as(a, 'insert into public.app_settings (key, value) values (''wod_sheet_url'', ''https://evil.example'')')),
  (26, '회원이 PR 글을 직접 지우기', 'err', pg_temp.run_as(a, format('delete from public.activities where one_rm_id = %L', rm_pr)));

  -- ---- 0003: 접속해 있던 동안의 대화만, 채팅 제한/잠금, 첫 기록도 PR
  -- 회원이 접속하기 전에 오간 대화처럼 보이도록 관리자 메시지 시간을 1분 앞당긴다
  update public.chat_messages set created_at = greatest(public.kst_today_start(), now() - interval '1 minute') where id = dm;
  insert into rls_results values
  (29, '승인 대기자가 채팅 접속 시작', 'err', pg_temp.run_as(c, 'select public.chat_session_start()')),
  (30, '회원이 접속 기록을 직접 만들기 (시간 위조)', 'err', pg_temp.run_as(a, format('insert into public.chat_sessions (user_id, started_at) values (%L, now() - interval ''1 day'')', a))),
  (31, '회원이 접속 전 대화를 조회', 'ok:0', pg_temp.run_as(a, format('select * from public.chat_messages where id = %L', dm))),
  (32, '회원 접속 시작', 'ok:1', pg_temp.run_as(a, 'select public.chat_session_start()'));
  insert into public.chat_messages (user_id, body) values (d, 'rls-test 접속 후 메시지') returning id into dm2;
  insert into rls_results values
  (33, '회원이 접속해 있는 동안의 대화는 조회 가능', 'ok:1', pg_temp.run_as(a, format('select * from public.chat_messages where id = %L', dm2)));

  update public.profiles set chat_muted_until = now() + interval '1 hour' where id = a;
  insert into rls_results values
  (34, '채팅 제한된 회원이 채팅 작성', 'err', pg_temp.run_as(a, 'insert into public.chat_messages (body) values (''rls-test 제한'')')),
  (35, '채팅 제한된 회원이 스스로 제한 해제', 'err', pg_temp.run_as(a, format('update public.profiles set chat_muted_until = null where id = %L', a))),
  (36, '회원이 다른 회원 채팅 제한', 'ok:0', pg_temp.run_as(a, format('update public.profiles set chat_muted_until = now() + interval ''1 day'' where id = %L', d)));
  update public.profiles set chat_muted_until = null where id = a;

  select value into lock_before from public.app_settings where key = 'chat_locked';
  insert into public.app_settings (key, value) values ('chat_locked', 'true')
    on conflict (key) do update set value = 'true';
  insert into rls_results values
  (37, '전체 잠금 중 회원 채팅 작성', 'err', pg_temp.run_as(a, 'insert into public.chat_messages (body) values (''rls-test 잠금'')')),
  (38, '전체 잠금 중에도 관리자는 작성 가능', 'ok:1', pg_temp.run_as(d, 'insert into public.chat_messages (body) values (''rls-test 관리자 공지'')')),
  (39, '회원이 전체 잠금 풀기', 'ok:0', pg_temp.run_as(a, 'update public.app_settings set value = ''false'' where key = ''chat_locked'''));
  if lock_before is null then
    delete from public.app_settings where key = 'chat_locked';
  else
    update public.app_settings set value = lock_before where key = 'chat_locked';
  end if;

  -- 처음 기록한 종목도 명예의 벽에 올라가는지
  insert into public.one_rm_records (user_id, movement, weight_kg) values (a, 'clean', 61.5) returning id into rm_first;
  insert into rls_results values
  (40, '종목 첫 기록도 PR 글 생성', 'ok:1', 'ok:' || (select count(*) from public.activities where one_rm_id = rm_first)::text);
  delete from public.one_rm_records where id = rm_first;

  -- 도배 방지: 10초 안에 5개를 이미 보냈으면 6번째는 거부
  -- 앞 테스트에서 관리자가 보낸 메시지를 지우고, 정확히 5개를 채운 뒤 6번째를 시도한다
  delete from public.chat_messages where user_id = d and body like 'rls-test%';
  insert into public.chat_messages (user_id, body)
    select d, 'rls-test 도배' from generate_series(1, 5);
  insert into rls_results values
  (27, '10초 안에 6번째 채팅 (도배)', 'err', pg_temp.run_as(d, 'insert into public.chat_messages (body) values (''rls-test 도배'')'));

  -- PR 기록을 지우면 명예의 벽 글도 함께 사라지는지
  r := pg_temp.run_as(a, format('delete from public.one_rm_records where id = %L', rm_pr));
  insert into rls_results values
  (28, '1RM 기록 삭제 시 PR 글도 자동 삭제', 'ok:0',
   r || ' → 남은 PR 글 ' || (select count(*) from public.activities where one_rm_id = rm_pr)::text);
  update rls_results set actual = 'ok:' || split_part(actual, '남은 PR 글 ', 2) where no = 28;

  -- 테스트 데이터 정리
  delete from realtime.messages where event = 'rls-test';
  delete from public.chat_messages where body like 'rls-test%';
  delete from public.chat_sessions where user_id = a and started_at = now();
  delete from public.one_rm_records where user_id = a and movement = 'snatch' and weight_kg in (50, 55) and created_at > now() - interval '1 minute';
  delete from public.events where id in (ev_full, ev_closed);
  delete from public.one_rm_records where id = rm;
  delete from public.activities where user_id = d and payload ->> 'movement' = 'deadlift' and created_at > now() - interval '1 minute';
  delete from auth.users where id = c;
end;
$$;

select
  no,
  scenario as "시나리오",
  expected as "기대",
  actual as "실제 결과",
  case when actual like expected || '%' then '✅ 통과' else '❌ 실패' end as "판정"
from rls_results
order by no;

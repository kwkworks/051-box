-- =====================================================================
-- 051 BOX 보안(RLS) 자동 테스트
-- SQL Editor에서 실행한다. 실제 사용자 권한으로 "막혀야 하는 요청"을 보내고 결과를 표로 보여준다.
-- 필요: 관리자 1명(admin) + 승인된 회원 1명(member). 승인 대기 계정은 테스트 중에 임시로 만들고 지운다.
-- 테스트로 만든 데이터는 마지막에 모두 삭제한다.
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

  -- 테스트 데이터 정리
  delete from realtime.messages where event = 'rls-test';
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

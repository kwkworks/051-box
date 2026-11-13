-- =====================================================================
-- 051 BOX 보안(RLS) 자동 테스트
-- SQL Editor에서 실행한다. 실제 사용자 권한으로 "막혀야 하는 요청"을 보내고 결과를 표로 보여준다.
-- 필요: 관리자 1명(admin) + 승인된 회원 1명(member). 승인 대기 계정과 기록 테스트용 회원안은 테스트 중에 임시로 만들고 지운다.
-- 1RM·기록 테스트는 임시 회원으로만 해서 실제 회원의 기록은 건드리지 않는다.
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
  m uuid := gen_random_uuid();  -- 임시 승인 회원 (기록 테스트용, 실제 회원 기록 보호)
  rm uuid;
  ev_full uuid;
  ev_closed uuid;
  dm uuid;     -- 관리자가 쓴 채팅
  rm_pr uuid;  -- 회원의 PR 기록
  dm2 uuid;    -- 회원이 접속한 뒤 관리자가 쓴 채팅
  rm_first uuid;
  g_cap uuid;  -- 정원 줄이기 테스트용 모임
  g_close uuid;  -- 신청 마감하기 테스트용 모임
  act_id uuid;   -- 축하 테스트용 명예의 벽 글
  w_past uuid;
  w_future uuid;
  anon_id uuid := gen_random_uuid();
  t_first uuid;
  a_gender text;
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
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (m, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'rls-test-member@example.invalid', '{"name":"RLS회원"}');
  update public.profiles set role = 'member' where id = m;
  insert into public.one_rm_records (user_id, movement, weight_lb) values (d, 'deadlift', 100) returning id into rm;
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
  insert into public.one_rm_records (user_id, movement, weight_lb) values (m, 'snatch', 50);
  insert into public.one_rm_records (user_id, movement, weight_lb) values (m, 'snatch', 55) returning id into rm_pr;

  insert into rls_results values
  (19, '승인 대기자가 채팅 기록 조회', 'ok:0', pg_temp.run_as(c, 'select * from public.chat_messages')),
  (20, '승인 대기자가 채팅 작성', 'err', pg_temp.run_as(c, 'insert into public.chat_messages (body) values (''rls-test'')')),
  (21, '회원이 남의 이름으로 채팅 작성', 'err', pg_temp.run_as(a, format('insert into public.chat_messages (user_id, body) values (%L, ''rls-test'')', d))),
  (22, '회원이 다른 회원의 채팅 삭제', 'ok:0', pg_temp.run_as(a, format('delete from public.chat_messages where id = %L', dm))),
  (23, '회원 본인 채팅 작성', 'ok:1', pg_temp.run_as(a, 'insert into public.chat_messages (body) values (''rls-test 회원 메시지'')')),
  (24, '회원이 앱 설정(시트 주소) 조회', 'ok:0', pg_temp.run_as(a, 'select * from public.app_settings')),
  (25, '회원이 시트 주소 바꾸기', 'err', pg_temp.run_as(a, 'insert into public.app_settings (key, value) values (''wod_sheet_url'', ''https://evil.example'')')),
  (26, '회원이 PR 글을 직접 지우기', 'err', pg_temp.run_as(m, format('delete from public.activities where one_rm_id = %L', rm_pr)));

  -- ---- 0003: 접속해 있던 동안의 대화만, 채팅 제한/잠금, 첫 기록도 PR
  -- 회원이 접속하기 전에 오간 대화처럼 보이도록 관리자 메시지 시간을 1분 앞당긴다
  update public.chat_messages set created_at = greatest(public.kst_today_start(), now() - interval '1 minute') where id = dm;
  insert into rls_results values
  (29, '승인 대기자가 채팅 접속 시작', 'err', pg_temp.run_as(c, 'select public.chat_session_start()')),
  (30, '회원이 접속 기록을 직접 만들기 (시간 위조)', 'err', pg_temp.run_as(a, format('insert into public.chat_sessions (user_id, started_at) values (%L, now() - interval ''1 day'')', a))),
  (31, '회원이 오늘 대화 전체 조회 (접속 전 대화 포함)', 'ok:1', pg_temp.run_as(a, format('select * from public.chat_messages where id = %L', dm))),
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
  insert into public.one_rm_records (user_id, movement, weight_lb) values (m, 'clean', 61.5) returning id into rm_first;
  insert into rls_results values
  (40, '종목 첫 기록도 PR 글 생성', 'ok:1', 'ok:' || (select count(*) from public.activities where one_rm_id = rm_first)::text);
  delete from public.one_rm_records where id = rm_first;

  -- ---- 0004: WOD 공개 시각 (지난 WOD는 보이고, 공개 전 미래 WOD는 관리자만)
  insert into public.wods (wod_date, title) values (public.kst_today() - 300, 'rls-test 지난 WOD') returning id into w_past;
  insert into public.wods (wod_date, title) values (public.kst_today() + 300, 'rls-test 미래 WOD') returning id into w_future;
  insert into rls_results values
  (41, '회원이 지난 WOD 조회', 'ok:1', pg_temp.run_as(a, format('select * from public.wods where id = %L', w_past))),
  (42, '회원이 공개 전 미래 WOD 조회', 'ok:0', pg_temp.run_as(a, format('select * from public.wods where id = %L', w_future))),
  (43, '관리자는 미래 WOD 미리 보기 가능', 'ok:1', pg_temp.run_as(d, format('select * from public.wods where id = %L', w_future))),
  (44, '공개 시각 규칙: 모레 WOD는 항상 비공개', 'ok:false', 'ok:' || public.wod_visible(public.kst_today() + 2)::text);
  delete from public.wods where id in (w_past, w_future);

  -- ---- 0005: 배포 전 보강 (닉네임 사칭, 하루 상한, 익명 가입)
  insert into rls_results values
  (45, '회원이 보이지 않는 문자가 섞인 닉네임으로 변경', 'err', pg_temp.run_as(a, format('update public.profiles set nickname = %L where id = %L', '관리' || chr(8203) || '자', a))),
  (46, '회원이 관리자와 같은 닉네임(대소문자만 다르게)으로 변경', 'err', pg_temp.run_as(a, format('update public.profiles set nickname = %L where id = %L', upper((select nickname from public.profiles where id = d)) || '', a)));
  -- 같은 날 1RM 20개를 채운 뒤 21번째는 거부
  insert into public.one_rm_records (user_id, movement, is_custom, weight_lb)
    select m, 'rls-test cap', true, 10 + g from generate_series(1, 20) g;
  insert into rls_results values
  (47, '하루 1RM 기록 21번째 (도배)', 'err', pg_temp.run_as(m, 'insert into public.one_rm_records (movement, is_custom, weight_lb) values (''rls-test cap'', true, 99)'));
  insert into rls_results values
  (49, '관리자가 회원의 1RM 기록 삭제', 'ok:1', pg_temp.run_as(d, format('delete from public.one_rm_records where id = (select id from public.one_rm_records where user_id = %L and movement = ''rls-test cap'' limit 1)', m)));
  delete from public.one_rm_records where user_id = m and movement = 'rls-test cap';
  -- 익명 로그인 계정은 회원 정보(승인 대기 목록)에 생기지 않는다
  insert into auth.users (id, instance_id, aud, role, is_anonymous, raw_user_meta_data)
  values (anon_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, '{}');
  insert into rls_results values
  (48, '익명 로그인 계정은 승인 대기 목록에 안 생김', 'ok:0', 'ok:' || (select count(*) from public.profiles where id = anon_id)::text);
  delete from auth.users where id = anon_id;

  -- ---- 0006: 오늘 대화 전체 공개 + 읽은 위치
  insert into public.chat_messages (user_id, body) values (d, 'rls-test 어제 메시지') returning id into dm2;
  update public.chat_messages set created_at = public.kst_today_start() - interval '1 hour' where id = dm2;
  insert into rls_results values
  (50, '회원이 어제 대화 조회', 'ok:0', pg_temp.run_as(a, format('select * from public.chat_messages where id = %L', dm2))),
  (51, '회원이 읽은 위치 저장 (함수)', 'ok:1', pg_temp.run_as(a, 'select public.chat_mark_read(now())')),
  (52, '회원이 다른 회원의 읽은 위치 직접 변경', 'err', pg_temp.run_as(a, format('update public.profiles set chat_read_at = now() where id = %L', d))),
  (53, '승인 대기자가 읽은 위치 저장', 'err', pg_temp.run_as(c, 'select public.chat_mark_read(now())'));
  delete from public.chat_messages where id = dm2;

  -- ---- 0007: 파운드 + 네임드 WOD 시간 기록 (빠를수록 PR)
  insert into public.one_rm_records (user_id, movement, unit, time_sec) values (m, 'fran', 'time', 300) returning id into t_first;
  insert into public.one_rm_records (user_id, movement, unit, time_sec) values (m, 'fran', 'time', 320);
  insert into public.one_rm_records (user_id, movement, unit, time_sec) values (m, 'fran', 'time', 280);
  insert into rls_results values
  (54, '네임드 WOD: 첫 기록 + 더 빠른 기록만 PR (느린 기록은 PR 아님)', 'ok:2',
   'ok:' || (select count(*) from public.activities a2 join public.one_rm_records r on r.id = a2.one_rm_id
             where r.user_id = m and r.movement = 'fran')::text),
  (55, '시간 기록에 무게를 같이 넣기', 'err', pg_temp.run_as(m, 'insert into public.one_rm_records (movement, unit, time_sec, weight_lb) values (''fran'', ''time'', 200, 95)')),
  (56, '리프트 종목을 시간으로 기록 (목록 밖)', 'err', pg_temp.run_as(m, 'insert into public.one_rm_records (movement, unit, time_sec) values (''back_squat'', ''time'', 200)')),
  (57, '회원이 파운드 기록 저장', 'ok:1', pg_temp.run_as(m, 'insert into public.one_rm_records (movement, weight_lb) values (''front_squat'', 185)'));
  delete from public.one_rm_records where user_id = m and ((movement = 'fran' and unit = 'time') or (movement = 'front_squat' and weight_lb = 185))
    and created_at > now() - interval '1 minute';

  -- ---- 0008: 승인 취소 회원 기록 숨김 + 관리자 전체 삭제
  -- 임시 계정 c를 회원으로 올려 "다른 회원" 시점으로 보고, 임시 회원 m을 잠시 승인 취소한다
  update public.profiles set role = 'member' where id = c;
  update public.profiles set role = 'pending' where id = m;
  insert into rls_results values
  (58, '승인 취소 회원의 1RM 기록을 다른 회원이 조회', 'ok:0', pg_temp.run_as(c, format('select 1 from public.one_rm_records where user_id = %L', m))),
  (59, '관리자는 승인 취소 회원 기록 조회 가능', 'ok:1', pg_temp.run_as(d, format('select 1 from public.one_rm_records where user_id = %L limit 1', m)));
  update public.profiles set role = 'member' where id = m;
  insert into rls_results values
  (60, '다시 승인하면 기록이 다시 보임', 'ok:1', pg_temp.run_as(c, format('select 1 from public.one_rm_records where user_id = %L limit 1', m))),
  (61, '회원이 기록 전체 삭제 함수 실행', 'err', pg_temp.run_as(c, format('select public.admin_purge_member_records(%L)', m))),
  (62, '관리자 계정의 기록 전체 삭제 시도', 'err', pg_temp.run_as(d, format('select public.admin_purge_member_records(%L)', d)));
  update public.profiles set role = 'pending' where id = c;

  -- 가입 거절 → 본인이 다시 신청 (거절 상태에서만, 승인 대기로만)
  update public.profiles set role = 'rejected' where id = c;
  insert into rls_results values
  (63, '거절된 사람이 스스로 회원으로 바꾸기', 'err', pg_temp.run_as(c, format('update public.profiles set role = ''member'' where id = %L', c))),
  (64, '거절된 사람이 다시 신청', 'ok:1', pg_temp.run_as(c, 'select public.reapply_membership()')),
  (66, '거절되지 않은 회원이 다시 신청 함수 실행', 'err', pg_temp.run_as(a, 'select public.reapply_membership()'));
  -- 한 문장 안에서는 바뀌기 전 값을 읽으므로, 다시 신청한 결과는 다음 문장에서 확인한다
  insert into rls_results values
  (65, '다시 신청하면 승인 대기 상태', 'ok:pending', 'ok:' || (select role from public.profiles where id = c));

  -- ---- 0009: 성별 (본인만, 정해진 값만)
  select gender into a_gender from public.profiles where id = a;
  insert into rls_results values
  (67, '회원이 자기 성별 저장', 'ok:1', pg_temp.run_as(a, format('update public.profiles set gender = ''F'' where id = %L', a))),
  (68, '회원이 다른 사람 성별 변경', 'ok:0', pg_temp.run_as(a, format('update public.profiles set gender = ''M'' where id = %L', d))),
  (69, '정해지지 않은 성별 값 저장', 'err', pg_temp.run_as(a, format('update public.profiles set gender = ''X'' where id = %L', a)));
  update public.profiles set gender = a_gender where id = a;  -- 원래 값으로 되돌림

  -- ---- 0010: 푸시 알림 (비밀값 없이는 받을 사람 목록을 못 받음) + 사진 순서
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (d, 'https://push.example.invalid/rls-test-admin', repeat('a', 40), repeat('b', 16));
  insert into rls_results values
  (70, '비로그인으로 알림 받을 사람 목록 요청 (틀린 비밀값)', 'err', pg_temp.run_as(null, 'select * from public.push_claim(''wrong'', ''notices'', ''rls-test'', null)')),
  (71, '회원이 알림 받을 사람 목록 요청 (틀린 비밀값)', 'err', pg_temp.run_as(a, 'select * from public.push_claim(''wrong'', ''notices'', ''rls-test'', null)')),
  (72, '회원이 다른 사람의 알림 구독 조회', 'ok:0', pg_temp.run_as(a, format('select * from public.push_subscriptions where user_id = %L', d))),
  (73, '회원이 구독을 직접 넣기 (함수 우회)', 'err', pg_temp.run_as(a, format('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, ''https://x.invalid/y'', repeat(''a'', 40), repeat(''b'', 16))', a))),
  (74, '회원이 본인 기기 알림 구독 (함수)', 'ok:1', pg_temp.run_as(a, 'select public.push_subscribe(''https://push.example.invalid/rls-test-member'', repeat(''a'', 40), repeat(''b'', 16))')),
  (75, '승인 대기자가 알림 구독', 'err', pg_temp.run_as(c, 'select public.push_subscribe(''https://push.example.invalid/rls-test-pending'', repeat(''a'', 40), repeat(''b'', 16))')),
  (76, '회원이 자기 알림 설정 저장', 'ok:1', pg_temp.run_as(a, format('update public.profiles set notify_prefs = notify_prefs where id = %L', a))),
  (77, '회원이 기록 사진 순서 변경', 'ok:0', pg_temp.run_as(a, 'update public.wod_photos set sort_order = 1'));
  delete from public.push_subscriptions where endpoint like 'https://push.example.invalid/rls-test%';

  -- ---- 0012: 용량 보기 (관리자만)
  insert into rls_results values
  (78, '회원이 앱 용량 조회', 'err', pg_temp.run_as(a, 'select public.admin_usage()')),
  (79, '비로그인으로 앱 용량 조회', 'err', pg_temp.run_as(null, 'select public.admin_usage()')),
  (80, '관리자가 앱 용량 조회', 'ok:1', pg_temp.run_as(d, 'select public.admin_usage()'));
  delete from public.push_subscriptions where endpoint like 'https://push.example.invalid/rls-test%';

  -- 도배 방지: 10초 안에 5개를 이미 보냈으면 6번째는 거부
  -- 앞 테스트에서 관리자가 보낸 메시지를 지우고, 정확히 5개를 채운 뒤 6번째를 시도한다
  delete from public.chat_messages where user_id = d and body like 'rls-test%';
  insert into public.chat_messages (user_id, body)
    select d, 'rls-test 도배' from generate_series(1, 5);
  insert into rls_results values
  (27, '10초 안에 6번째 채팅 (도배)', 'err', pg_temp.run_as(d, 'insert into public.chat_messages (body) values (''rls-test 도배'')'));

  -- PR 기록을 지우면 명예의 벽 글도 함께 사라지는지
  r := pg_temp.run_as(m, format('delete from public.one_rm_records where id = %L', rm_pr));
  insert into rls_results values
  (28, '1RM 기록 삭제 시 PR 글도 자동 삭제', 'ok:0',
   r || ' → 남은 PR 글 ' || (select count(*) from public.activities where one_rm_id = rm_pr)::text);
  update rls_results set actual = 'ok:' || split_part(actual, '남은 PR 글 ', 2) where no = 28;

  -- ---- 0013: 등록 시각은 DB가 정한다 + 정원은 신청 인원 아래로 못 줄인다
  r := pg_temp.run_as(m, 'insert into public.one_rm_records (movement, is_custom, weight_lb, created_at) values (''rls-test created'', true, 10, ''2020-01-01'')');
  insert into rls_results values
  (81, '회원이 등록 시각을 과거로 넣기 (하루 제한 우회)', 'ok:1',
   'ok:' || (select count(*) from public.one_rm_records where user_id = m and movement = 'rls-test created' and created_at >= public.kst_today_start())::text);
  insert into public.events (kind, title, starts_at, capacity, created_by)
    values ('gathering', 'rls-test 정원 줄이기', now() + interval '1 day', 5, m) returning id into g_cap;
  insert into public.event_participants (event_id, user_id) values (g_cap, a), (g_cap, m);
  insert into rls_results values
  (82, '모임 만든 사람이 정원을 신청 인원보다 적게 수정', 'err', pg_temp.run_as(m, format('update public.events set capacity = 1 where id = %L', g_cap)));
  r := pg_temp.run_as(m, format('update public.events set created_at = ''2020-01-01'' where id = %L', g_cap));
  insert into rls_results values
  (83, '모임 만든 사람이 등록 시각 바꾸기', 'ok:1',
   'ok:' || (select count(*) from public.events where id = g_cap and created_at >= public.kst_today_start())::text);

  -- ---- 0015: 회원 탈퇴 + 가입 요청 알림
  insert into rls_results values
  (84, '비로그인으로 탈퇴 함수 실행', 'err', pg_temp.run_as(null, 'select public.delete_my_account()')),
  (85, '관리자 계정 탈퇴', 'err', pg_temp.run_as(d, 'select public.delete_my_account()')),
  (86, '회원이 가입 알림 대상 요청 (틀린 비밀값)', 'err', pg_temp.run_as(a, format('select * from public.push_claim_signup(''wrong'', %L, ''rls-test'')', c))),
  (87, '비로그인으로 가입 알림 대상 요청 (틀린 비밀값)', 'err', pg_temp.run_as(null, format('select * from public.push_claim_signup(''wrong'', %L, ''rls-test'')', c)));
  -- 일반 회원이 앱과 같은 방식(저장 후 결과 돌려받기)으로 모임 만들기
  insert into rls_results values
  (89, '일반 회원이 모임 만들기', 'ok:1', pg_temp.run_as(a, 'insert into public.events (kind, title, starts_at) values (''gathering'', ''rls-test 회원 모임'', now() + interval ''1 day'') returning id')),
  (90, '일반 회원이 대회 만들기', 'err', pg_temp.run_as(a, 'insert into public.events (kind, title, starts_at) values (''competition'', ''rls-test 회원 대회'', now() + interval ''1 day'') returning id'));
  delete from public.events where title in ('rls-test 회원 모임', 'rls-test 회원 대회');

  -- 0016: 마감하기 / 다시 신청 받기 (서버와 같은 방식: closed_at을 지금으로 / 지우기, 신청 마감일은 그대로)
  insert into public.events (kind, title, starts_at, signup_deadline, created_by)
    values ('gathering', 'rls-test 마감하기', now() + interval '2 days', now() + interval '1 day', m) returning id into g_close;
  insert into rls_results values
  (91, '다른 회원이 남의 모임 마감하기', 'ok:0', pg_temp.run_as(a, format('update public.events set closed_at = now() where id = %L', g_close))),
  (92, '모임 만든 사람이 마감하기', 'ok:1', pg_temp.run_as(m, format('update public.events set closed_at = now() where id = %L', g_close))),
  (93, '마감한 모임에 신청 (마감일 전이어도)', 'err', pg_temp.run_as(a, format('insert into public.event_participants (event_id) values (%L)', g_close))),
  (94, '모임 만든 사람이 다시 신청 받기', 'ok:1', pg_temp.run_as(m, format('update public.events set closed_at = null where id = %L', g_close))),
  (95, '다시 받은 모임에 신청 (원래 마감일 유지)', 'ok:1', pg_temp.run_as(a, format('insert into public.event_participants (event_id) values (%L)', g_close)));

  -- 0017: 명예의 벽 축하해요 (임시 회원 m의 첫 기록 글을 쓴다. 실제 회원 데이터와 무관)
  select id into act_id from public.activities where user_id = m order by created_at limit 1;
  if act_id is null then
    raise exception '축하 테스트용 글이 없어요 (임시 회원 m의 PR 글)';
  end if;
  insert into public.activity_likes (activity_id, user_id) values (act_id, d);
  insert into rls_results values
  (96, '회원이 명예의 벽 글에 축하해요', 'ok:1', pg_temp.run_as(a, format('insert into public.activity_likes (activity_id) values (%L)', act_id))),
  (97, '같은 글에 축하해요 두 번', 'err', pg_temp.run_as(a, format('insert into public.activity_likes (activity_id) values (%L)', act_id))),
  (98, '남의 이름으로 축하해요', 'err', pg_temp.run_as(a, format('insert into public.activity_likes (activity_id, user_id) values (%L, %L)', act_id, m))),
  (99, '남의 축하 취소', 'ok:0', pg_temp.run_as(a, format('delete from public.activity_likes where activity_id = %L and user_id = %L', act_id, d))),
  (100, '비로그인으로 축하 목록 조회', 'err', pg_temp.run_as(null, 'select * from public.activity_likes')),
  (101, '승인 대기자가 축하해요', 'err', pg_temp.run_as(c, format('insert into public.activity_likes (activity_id) values (%L)', act_id))),
  (102, '회원 본인 축하 취소', 'ok:1', pg_temp.run_as(a, format('delete from public.activity_likes where activity_id = %L and user_id = %L', act_id, a)));

  -- 마지막: 임시 회원 m이 스스로 탈퇴 → 계정과 기록이 모두 사라지는지
  r := pg_temp.run_as(m, 'select public.delete_my_account()');
  insert into rls_results values
  (88, '회원 본인 탈퇴 (계정·기록 함께 삭제)', 'ok:0',
   case when r like 'ok:%' then 'ok:' || ((select count(*) from public.profiles where id = m) + (select count(*) from public.one_rm_records where user_id = m))::text else r end);

  -- 테스트 데이터 정리
  delete from realtime.messages where event = 'rls-test';
  delete from public.chat_messages where body like 'rls-test%';
  delete from public.chat_sessions where user_id = a and started_at = now();
  delete from public.one_rm_records where user_id = m and movement = 'snatch' and weight_lb in (50, 55) and created_at > now() - interval '1 minute';
  delete from public.events where id in (ev_full, ev_closed);
  delete from public.one_rm_records where id = rm;
  delete from public.activities where user_id = d and payload ->> 'movement' = 'deadlift' and created_at > now() - interval '1 minute';
  delete from auth.users where id = c;
  delete from auth.users where id = m;  -- 임시 회원의 기록·PR 글도 함께 지워진다
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

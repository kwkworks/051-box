-- =====================================================================
-- 051 BOX 알림 점검 (읽기 전용: 아무것도 바꾸지 않는다)
-- SQL Editor에서 실행하면 한 표로 보여준다. 개인 정보(구독 주소, 회원 이름)는 표시하지 않는다.
-- =====================================================================
with job as (
  select jobid, active, schedule from cron.job where jobname = 'wod-release-push'
),
runs as (
  select d.start_time, d.status, d.return_message
  from cron.job_run_details d join job on d.jobid = job.jobid
  order by d.start_time desc
  limit 6
),
resp as (
  select r.created, r.status_code, left(coalesce(r.content::text, r.error_msg, ''), 80) as body
  from net._http_response r
  order by r.created desc
  limit 6
),
sent as (
  select kind, ref, sent_at from private.push_log order by sent_at desc limit 8
)
select 1 as no, '예약 작업' as "항목",
       coalesce((select format('켜짐=%s, 일정=%s', active, schedule) from job), '❌ 예약 없음') as "내용"
union all
select 2, '예약 실행 (최근)', coalesce((select string_agg(format('%s %s', to_char(start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), status), ' / ') from runs), '기록 없음')
union all
select 3, '서버 응답 (최근)', coalesce((select string_agg(format('%s %s %s', to_char(created at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), status_code, body), ' / ') from resp), '기록 없음')
union all
select 4, '보낸 알림 (최근)', coalesce((select string_agg(format('%s %s %s', to_char(sent_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), kind, left(ref, 10)), ' / ') from sent), '기록 없음')
union all
select 5, '알림 켠 기기 / 회원 수', (select format('기기 %s대 / 회원 %s명', count(*), count(distinct user_id)) from public.push_subscriptions)
order by no;

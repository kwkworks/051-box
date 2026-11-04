-- =====================================================================
-- 0011: 매일 오후 8시 30분(한국 시간) "내일 WOD 공개" 푸시 알림 예약
--  - Supabase 무료 기능 pg_cron(예약 실행) + pg_net(서버 호출)을 쓴다
--  - 20:20, 20:25에 미리 불러 무료 서버를 깨워 두고, 20:30에 실제로 보낸다
--    (WOD는 20:30에 공개되므로 서버는 20:30 이전 호출에는 보내지 않고, 하루 한 번만 보낸다)
--  - 비밀값은 여기 넣지 않는다 (서버가 갖고 있음)
-- 0010 실행과 Render 환경변수 설정이 끝난 뒤 실행한다.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 같은 이름의 예약이 있으면 먼저 지운다 (다시 실행해도 안전)
select cron.unschedule(jobid) from cron.job where jobname = 'wod-release-push';

-- 11:20, 11:25, 11:30 UTC = 한국 시간 20:20, 20:25, 20:30
select cron.schedule(
  'wod-release-push',
  '20,25,30 11 * * *',
  $$
  select net.http_post(
    url := 'https://zero51-box.onrender.com/push/wod-release',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 확인: 아래 결과에 wod-release-push 가 보이면 예약 완료
select jobname, schedule, active from cron.job where jobname = 'wod-release-push';

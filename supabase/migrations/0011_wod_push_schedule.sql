-- =====================================================================
-- 0011: 매일 오후 8시 30분(한국 시간) "내일 WOD 공개" 푸시 알림 예약
--  - Supabase 무료 기능 pg_cron(예약 실행) + pg_net(서버 호출)을 쓴다
--  - 서버(/push/wod-release)는 20:30 이후·내일 WOD가 있을 때·하루 한 번만 실제로 보낸다
--    → 무료 서버가 잠들어 있을 때를 대비해 20:30, 20:35, 20:45에 세 번 불러도 알림은 한 번만 간다
--  - 비밀값은 여기 넣지 않는다 (서버가 갖고 있음)
-- 0010 실행과 Render 환경변수 설정이 끝난 뒤 실행한다.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 같은 이름의 예약이 있으면 먼저 지운다 (다시 실행해도 안전)
select cron.unschedule(jobid) from cron.job where jobname = 'wod-release-push';

-- 11:30, 11:35, 11:45 UTC = 한국 시간 20:30, 20:35, 20:45
select cron.schedule(
  'wod-release-push',
  '30,35,45 11 * * *',
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

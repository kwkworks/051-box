import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../schemas.js';
import { pushEnabled, sendPushLater, sendTestPush, tomorrowWod } from '../push.js';

// ---- 로그인 없이 부르는 것: 매일 오후 8시 30분 예약 작업(Supabase pg_cron)이 호출
// 누가 불러도 안전하다: 한국 시간 20:30~24:00에만, 내일 WOD가 있을 때만, 하루 한 번만(DB가 중복 차단) 보낸다
export const pushPublicRouter = Router();

pushPublicRouter.post('/wod-release', async (req, res) => {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (minutes < 20 * 60 + 30) return res.json({ ok: false, reason: 'too-early' });
  const wod = await tomorrowWod();
  if (!wod) return res.json({ ok: false, reason: 'no-wod' });
  sendPushLater('wod', wod.wod_date, null, {
    title: '📋 내일 WOD가 공개됐어요',
    body: wod.title,
    url: '/wod',
  });
  res.json({ ok: true });
});

// ---- 로그인한 회원
export const pushRouter = Router();

pushRouter.get('/status', (req, res) => {
  res.json({ enabled: pushEnabled() });
});

// 이 기기에서 알림 받기
pushRouter.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = pushSubscribeSchema.parse(req.body);
  unwrap(await req.sb.rpc('push_subscribe', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }));
  res.status(201).json({ ok: true });
});

// 이 기기에서 알림 끄기
pushRouter.post('/unsubscribe', async (req, res) => {
  const { endpoint } = pushUnsubscribeSchema.parse(req.body);
  unwrap(await req.sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
  res.status(204).end();
});

// 내 기기로 테스트 알림
pushRouter.post('/test', async (req, res) => {
  if (!pushEnabled()) throw new HttpError(503, '알림 서버 설정이 아직 끝나지 않았어요');
  const sent = await sendTestPush(req.userId);
  res.json({ sent });
});

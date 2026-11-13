// 푸시 알림 보내기. service_role 키 없이, 서버만 아는 비밀값(PUSH_SECRET)으로 DB 함수에서 받을 사람 목록을 받는다.
// 키가 설정되지 않았으면 조용히 건너뛴다 (알림만 안 갈 뿐 다른 기능은 그대로).
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { config } from './config.js';

// 키 값이 잘못돼도 서버 전체가 멈추지 않게: 알림만 끄고 이유를 로그에 남긴다 (키 값 자체는 남기지 않음)
function setupVapid() {
  if (!(config.vapidPublicKey && config.vapidPrivateKey && config.pushSecret)) {
    console.warn('[push] VAPID 키 또는 PUSH_SECRET이 없어 푸시 알림을 보내지 않습니다');
    return false;
  }
  try {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    console.log('[push] 푸시 알림 준비 완료');
    return true;
  } catch (e) {
    console.error(`[push] 알림 키 설정이 올바르지 않아 알림을 끕니다: ${e?.message}`);
    return false;
  }
}
const enabled = setupVapid();

// 로그인 없이(공개 키) 부르는 서버 전용 클라이언트. DB 함수가 비밀값을 확인한다
const sb = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export const pushEnabled = () => enabled;

async function deliver(targets, payload) {
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    (targets ?? []).map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, {
          TTL: 12 * 60 * 60,
          timeout: 10_000,
        });
        sent += 1;
      } catch (e) {
        // 404/410: 사용자가 알림을 끄거나 앱을 지운 구독 → 정리
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sb.rpc('push_remove', { p_secret: config.pushSecret, p_endpoint: t.endpoint });
        } else {
          console.warn('[push] 보내기 실패', e?.statusCode ?? e?.message);
        }
      }
    }),
  );
  return sent;
}

// kind: 'wod' | 'notices' | 'competition' | 'gathering', ref: 같은 알림 중복 방지용 (글 id, 날짜)
async function sendPush(kind, ref, actorId, payload) {
  if (!enabled) return 0;
  const { data, error } = await sb.rpc('push_claim', {
    p_secret: config.pushSecret,
    p_kind: kind,
    p_ref: String(ref),
    p_actor: actorId ?? null,
  });
  if (error) {
    console.warn('[push] 받을 사람을 불러오지 못했어요', error.code);
    return 0;
  }
  return deliver(data, payload);
}

// 응답을 기다리게 하지 않고 뒤에서 보낸다
export function sendPushLater(kind, ref, actorId, payload) {
  sendPush(kind, ref, actorId, payload).catch((e) => console.warn('[push]', e?.message));
}

// 새 가입 요청 → "가입 요청 알림"을 켠 관리자 기기에만. ref가 같으면 한 번만 보낸다
export function sendSignupPushLater(userId, ref, nickname) {
  if (!enabled) return;
  (async () => {
    const { data, error } = await sb.rpc('push_claim_signup', { p_secret: config.pushSecret, p_user: userId, p_ref: ref });
    if (error) {
      console.warn('[push] 가입 알림 대상을 불러오지 못했어요', error.code);
      return;
    }
    await deliver(data, { title: '🙋 새 가입 요청', body: `${nickname ?? '새 회원'}님이 가입 승인을 기다려요`, url: '/admin' });
  })().catch((e) => console.warn('[push]', e?.message));
}

// 축하해요 🎉 → PR 글 주인에게 (자기 글·중복·알림 끈 사람은 DB 함수가 걸러낸다)
export function sendCheerPushLater(activityId, likerId, payload) {
  if (!enabled) return;
  (async () => {
    const { data, error } = await sb.rpc('push_claim_cheer', { p_secret: config.pushSecret, p_activity: activityId, p_liker: likerId });
    if (error) {
      console.warn('[push] 축하 알림 대상을 불러오지 못했어요', error.code);
      return;
    }
    await deliver(data, payload);
  })().catch((e) => console.warn('[push]', e?.message));
}

export async function sendTestPush(userId) {
  if (!enabled) return 0;
  const { data, error } = await sb.rpc('push_targets_for_user', { p_secret: config.pushSecret, p_user: userId });
  if (error) return 0;
  return deliver(data, { title: '🔔 051 BOX 알림 테스트', body: '알림이 잘 도착했어요!', url: '/board' });
}

export async function tomorrowWod() {
  if (!enabled) return null;
  const { data, error } = await sb.rpc('push_wod_tomorrow', { p_secret: config.pushSecret });
  if (error) return null;
  return data?.[0] ?? null;
}

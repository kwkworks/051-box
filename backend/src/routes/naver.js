import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { z } from 'zod';
import { authorizeUrl, connectWithCode, consumeState, disconnect, naverEnabled, startState } from '../naver.js';
import { config } from '../config.js';

// ---- 로그인 없이: 네이버 연결의 시작과 끝 (관리자 브라우저가 직접 오가는 주소)
// 1) /naver/start: 관리자가 "연결하기"를 누르면 이 주소로 온다. 이 브라우저에만 일회용 표시(쿠키)를 남기고
//    그 해시를 state에 묶은 뒤 네이버 로그인으로 보낸다. 같은 state로는 한 번만 시작할 수 있다.
// 2) /naver/callback: 네이버가 돌려보내면 state(10분, 한 번만)와 브라우저 표시가 모두 맞을 때만 연결한다.
//    연결 주소가 새어 나가도 다른 브라우저에서는 연결을 끝낼 수 없다.
export const naverPublicRouter = Router();

const COOKIE = 'naver_oauth';
const STATE_RE = /^[0-9a-f]{48}$/;
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const back = (res, result) => res.redirect(302, `${config.appUrl}/admin?naver=${result}`);

function readCookie(req) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return '';
}

naverPublicRouter.get('/start', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!naverEnabled() || !STATE_RE.test(state)) return back(res, 'fail');
  try {
    const nonce = randomBytes(32).toString('hex');
    if (!(await startState(state, sha256(nonce)))) return back(res, 'expired');
    res.cookie(COOKIE, nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/naver', maxAge: 10 * 60_000 });
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, authorizeUrl(state));
  } catch (e) {
    console.warn('[naver] 연결 시작 실패', e instanceof Error ? e.message : e);
    return back(res, 'fail');
  }
});

naverPublicRouter.get('/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const nonce = readCookie(req);
  res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/naver' });
  res.set('Cache-Control', 'no-store');
  if (!naverEnabled() || !code || !STATE_RE.test(state)) return back(res, 'fail');
  if (!/^[0-9a-f]{64}$/.test(nonce)) return back(res, 'browser');
  try {
    const adminId = await consumeState(state, sha256(nonce));
    if (!adminId) return back(res, 'expired');
    await connectWithCode(code, state, adminId);
    return back(res, 'connected');
  } catch (e) {
    console.warn('[naver] 연결 실패', e instanceof Error ? e.message : e);
    return back(res, 'fail');
  }
});

// ---- 관리자 전용 (/admin/naver)
export const naverAdminRouter = Router();

naverAdminRouter.get('/', async (req, res) => {
  if (!naverEnabled()) return res.json({ enabled: false, connected: false });
  const status = unwrap(await req.sb.rpc('naver_status'));
  const setting = unwrap(await req.sb.from('app_settings').select('value').eq('key', 'cafe_wod_autopost').maybeSingle());
  res.json({ enabled: true, ...status, wod_autopost: setting?.value === 'true' });
});

naverAdminRouter.post('/connect', async (req, res) => {
  if (!naverEnabled()) throw new HttpError(400, '네이버 카페 연동이 아직 설정되지 않았어요 (Render 환경변수)');
  const state = unwrap(await req.sb.rpc('naver_state_create'));
  // 바로 네이버로 보내지 않고 이 서버의 /naver/start를 거쳐 브라우저 표시를 남긴다
  const start = new URL('/naver/start', new URL(config.naverRedirectUri).origin);
  start.searchParams.set('state', state);
  res.json({ url: start.toString() });
});

naverAdminRouter.delete('/', async (req, res) => {
  if (!naverEnabled()) return res.status(204).end();
  await disconnect();
  res.status(204).end();
});

// WOD 카페 자동 등록 켜기/끄기 (매일 20:30 내일 WOD 공개 때)
naverAdminRouter.put('/wod-autopost', async (req, res) => {
  const { enabled } = z.strictObject({ enabled: z.boolean() }).parse(req.body);
  unwrap(
    await req.sb
      .from('app_settings')
      .upsert({ key: 'cafe_wod_autopost', value: String(enabled), updated_at: new Date().toISOString() }, { onConflict: 'key' }),
  );
  res.json({ wod_autopost: enabled });
});

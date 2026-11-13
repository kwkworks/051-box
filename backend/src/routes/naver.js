import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { authorizeUrl, connectWithCode, consumeState, disconnect, naverEnabled } from '../naver.js';
import { config } from '../config.js';

// ---- 로그인 없이: 네이버가 연결을 마치고 돌려보내는 주소.
// 관리자가 방금 만든 일회용 state(10분, 한 번만)가 맞을 때만 연결한다 (위조된 요청 차단)
export const naverPublicRouter = Router();

naverPublicRouter.get('/callback', async (req, res) => {
  const back = (result) => res.redirect(302, `${config.appUrl}/admin?naver=${result}`);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!naverEnabled() || !code || !/^[0-9a-f]{48}$/.test(state)) return back('fail');
  try {
    const adminId = await consumeState(state);
    if (!adminId) return back('expired');
    await connectWithCode(code, state, adminId);
    return back('connected');
  } catch (e) {
    console.warn('[naver] 연결 실패', e instanceof Error ? e.message : e);
    return back('fail');
  }
});

// ---- 관리자 전용 (/admin/naver)
export const naverAdminRouter = Router();

naverAdminRouter.get('/', async (req, res) => {
  if (!naverEnabled()) return res.json({ enabled: false, connected: false });
  const status = unwrap(await req.sb.rpc('naver_status'));
  res.json({ enabled: true, ...status });
});

naverAdminRouter.post('/connect', async (req, res) => {
  if (!naverEnabled()) throw new HttpError(400, '네이버 카페 연동이 아직 설정되지 않았어요 (Render 환경변수)');
  const state = unwrap(await req.sb.rpc('naver_state_create'));
  res.json({ url: authorizeUrl(state) });
});

naverAdminRouter.delete('/', async (req, res) => {
  if (!naverEnabled()) return res.status(204).end();
  await disconnect();
  res.status(204).end();
});

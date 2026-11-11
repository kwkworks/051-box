import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { HttpError, fromDbError } from './errors.js';

// 요청한 사용자의 토큰으로 Supabase 클라이언트를 만든다. DB는 이 사용자 권한으로만 동작한다(RLS 적용).
function createUserClient(token) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// 1단계: 로그인 토큰 검증 → req.sb(사용자 권한 DB 클라이언트), req.userId, req.profile
export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const match = header.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) throw new HttpError(401, '로그인이 필요합니다');
  const token = match[1];

  const sb = createUserClient(token);
  let data;
  let error;
  try {
    ({ data, error } = await sb.auth.getClaims(token));
  } catch {
    // 형식이 깨진 토큰은 라이브러리가 예외를 던진다 → 서버 오류(500)가 아니라 로그인 필요(401)
    throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인해주세요');
  }
  // 인증 서버 키를 못 받아오는 등 네트워크 문제는 "로그인 만료"가 아니다 → 잠시 후 다시 시도하게 한다
  if (error && (error.name === 'AuthRetryableFetchError' || (typeof error.status === 'number' && error.status >= 500))) {
    throw new HttpError(503, '로그인 확인이 잠시 지연되고 있어요. 잠시 후 다시 시도해주세요');
  }
  const userId = data?.claims?.sub;
  if (error || !userId || data.claims.role !== 'authenticated') {
    throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인해주세요');
  }

  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('id, nickname, role, avatar, gender, notify_prefs, created_at, chat_muted_until')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw fromDbError(profileError);
  if (!profile) throw new HttpError(401, '회원 정보를 찾을 수 없습니다');

  req.sb = sb;
  req.userId = userId;
  req.profile = profile;
  next();
}

// 2단계: 역할 확인. DB(RLS)가 한 번 더 검사하므로 이중 방어가 된다.
export function requireMember(req, res, next) {
  if (!['member', 'admin'].includes(req.profile?.role)) {
    throw new HttpError(403, '관리자 승인 후 이용할 수 있어요');
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') throw new HttpError(403, '관리자만 할 수 있어요');
  next();
}

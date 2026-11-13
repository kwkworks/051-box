// 네이버 카페 연동 (앱 → 카페 글 올리기).
// 관리자가 한 번 "네이버 카페 연결"을 하면, 네이버가 준 토큰을 DB의 private 영역에 저장해 두고(서버 비밀값으로만 접근)
// 공지를 쓸 때 공식 "카페 글쓰기" API로 카페에도 올린다. 네이버 비밀번호는 앱이 절대 받지 않는다.
// 설정(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)이 없으면 이 기능만 꺼진다.
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { LABELS, percentText } from './labels.js';

const CAFE_ID = '31088296'; // 크로스핏051 카페
export const CAFE_MENUS = { notice: 9, competition: 50, wod: 12, record: 13 }; // 공지사항, 대회 정보 공유, WOD, RECORD
const CAFE_URL_BASE = 'https://cafe.naver.com/crossfit051';

const sb = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export const naverEnabled = () => Boolean(config.naverClientId && config.naverClientSecret && config.pushSecret);

// 카페 글 주소를 한 가지 모양으로 (https://cafe.naver.com/crossfit051/6118). 우리 카페 글이 아니면 null
export function normalizeCafeUrl(input) {
  const s = String(input ?? '').trim();
  if (!/(cafe\.naver\.com)/i.test(s)) return null;
  if (!/(crossfit051|31088296)/i.test(s)) return null;
  const m = s.match(/articles\/(\d{1,12})/i) || s.match(/crossfit051\/(\d{1,12})(?:[/?#]|$)/i) || s.match(/articleid=(\d{1,12})/i);
  return m ? `${CAFE_URL_BASE}/${m[1]}` : null;
}

export function authorizeUrl(state) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: config.naverClientId,
    redirect_uri: config.naverRedirectUri,
    state,
    // 이미 동의한 적이 있어도 동의 화면을 다시 띄운다 (카페 글쓰기 권한이 빠진 채 연결되는 것 방지)
    auth_type: 'reprompt',
  });
  return `https://nid.naver.com/oauth2.0/authorize?${q}`;
}

async function tokenRequest(params) {
  const q = new URLSearchParams({ client_id: config.naverClientId, client_secret: config.naverClientSecret, ...params });
  const res = await fetch(`https://nid.naver.com/oauth2.0/token?${q}`, { signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`네이버 인증 실패 (${data.error ?? res.status})`); // 토큰 값은 남기지 않는다
  }
  return data;
}

// 네이버에서 돌아온 code로 토큰을 받아 저장한다
export async function connectWithCode(code, state, adminId) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, state });
  await saveToken(t.access_token, t.refresh_token, t.expires_in, adminId);
}

async function saveToken(access, refresh, expiresIn, by) {
  const expiresAt = new Date(Date.now() + (Number(expiresIn) || 3600) * 1000).toISOString();
  const { error } = await sb.rpc('naver_token_save', {
    p_secret: config.pushSecret,
    p_access: access,
    p_refresh: refresh,
    p_expires_at: expiresAt,
    p_by: by ?? null,
  });
  if (error) throw new Error(`네이버 연결 정보를 저장하지 못했어요 (${error.code})`);
}

export async function consumeState(state) {
  const { data, error } = await sb.rpc('naver_state_consume', { p_secret: config.pushSecret, p_state: state });
  if (error) throw new Error(`연결 확인 실패 (${error.code})`);
  return data; // 관리자 id 또는 null
}

export async function disconnect() {
  const { error } = await sb.rpc('naver_token_clear', { p_secret: config.pushSecret });
  if (error) throw new Error(`연결을 끊지 못했어요 (${error.code})`);
}

// 유효한 access token (만료 5분 전이면 새로 받는다)
async function accessToken() {
  const { data, error } = await sb.rpc('naver_token_get', { p_secret: config.pushSecret });
  if (error) throw new Error(`네이버 연결 정보를 읽지 못했어요 (${error.code})`);
  const row = data?.[0];
  if (!row) throw new Error('네이버 카페가 연결되어 있지 않아요. 관리자 화면에서 먼저 연결해 주세요');
  if (new Date(row.expires_at).getTime() - Date.now() > 5 * 60_000) return row.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  await saveToken(t.access_token, t.refresh_token || row.refresh_token, t.expires_in, null);
  return t.access_token;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 네이버 카페 글쓰기 API는 제목·본문을 UTF-8로 인코딩한 값을 한 번 더 인코딩해서 보내는 방식(공식 예제)을 쓴다.
const encDouble = (v) => encodeURIComponent(encodeURIComponent(v));
const encSingle = (v) => encodeURIComponent(v);
// 이모지처럼 4바이트 글자는 네이버 글쓰기 API가 이유 없이 거절(999)하는 경우가 있어 재시도 때 뺀다
const stripEmoji = (s) => String(s).replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[‍️]/g, '');

async function tryPost(token, menuId, subject, content, enc) {
  const res = await fetch(`https://openapi.naver.com/v1/cafe/${CAFE_ID}/menu/${menuId}/articles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `subject=${enc(subject)}&content=${enc(content)}`,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  const articleId = data?.message?.result?.articleId;
  if (res.ok && articleId) return { articleId };
  // 네이버가 알려 준 이유(코드·문구). 토큰 같은 비밀 값은 들어 있지 않다
  const err = data?.message?.error ?? {};
  return {
    status: res.status,
    code: String(err.code ?? data?.errorCode ?? ''),
    reason: String(err.msg ?? err.message ?? data?.errorMessage ?? `HTTP ${res.status}`).slice(0, 120),
  };
}

// 카페에 글 올리기 → 카페 글 주소.
// 형식 문제(999)면 안전한 형식으로 바꿔 자동으로 다시 시도한다: ① 기본 ② 이모지 뺌 ③ 한 번만 인코딩
export async function postToCafe(menuKey, subject, bodyText) {
  const menuId = CAFE_MENUS[menuKey];
  if (!menuId) throw new Error('올릴 카페 게시판이 올바르지 않아요');
  const token = await accessToken();
  const toHtml = (t) => `${escapeHtml(t).replace(/\r?\n/g, '<br>')}<br><br>(051 BOX 앱에서 올린 글입니다)`;
  const first = config.naverCafeEncode === 'single' ? encSingle : encDouble;
  const second = first === encDouble ? encSingle : encDouble;
  const attempts = [
    { subject, content: toHtml(bodyText), enc: first },
    { subject: stripEmoji(subject), content: toHtml(stripEmoji(bodyText)), enc: first },
    { subject: stripEmoji(subject), content: toHtml(stripEmoji(bodyText)), enc: second },
  ];
  let last = null;
  for (const [i, a] of attempts.entries()) {
    const r = await tryPost(token, menuId, a.subject, a.content, a.enc);
    if (r.articleId) {
      if (i > 0) console.warn(`[naver] 카페 글쓰기 ${i + 1}번째 방식으로 성공`);
      return `${CAFE_URL_BASE}/${r.articleId}`;
    }
    last = r;
    console.warn('[naver] 카페 글쓰기 실패', i + 1, r.status, r.code, r.reason);
    if (r.status === 401) break; // 권한·인증 문제는 형식을 바꿔도 같다
  }
  throw new Error(`네이버가 거절했어요 (${last.status}${last.code ? ` · ${last.code}` : ''}: ${last.reason})`);
}

// ---- 오늘의 WOD → 카페 WOD 게시판
// 제목은 카페에서 쓰던 모양 그대로: 2026_11_14 Workout of the Day
export function wodCafePost(wod) {
  const subject = `${String(wod.wod_date).replace(/-/g, '_')} Workout of the Day`;
  const lines = [];
  if (wod.title && !/WOD$/.test(wod.title)) lines.push(wod.title, '');
  if (wod.content) lines.push(wod.content);
  const lifts = Array.isArray(wod.lifts) ? wod.lifts : [];
  if (lifts.length) {
    lines.push('', '[강도]');
    for (const l of lifts) lines.push(`${LABELS[l.movement] ?? l.movement} ${(l.percents ?? []).map(percentText).join(', ')}`);
  }
  lines.push('', '내 1RM 기준 무게는 051 BOX 앱에서 확인하세요');
  return { subject, body: lines.join('\n') };
}

// 20:30 공개 때 부른다: 자동 등록이 켜져 있고 아직 안 올린 내일 WOD만 (하루 한 번)
export async function autoPostWodToCafe() {
  if (!naverEnabled()) return null;
  const { data, error } = await sb.rpc('cafe_wod_pending', { p_secret: config.pushSecret });
  if (error) throw new Error(`카페 WOD 대상을 불러오지 못했어요 (${error.code})`);
  const wod = data?.[0];
  if (!wod) return null;
  const { subject, body } = wodCafePost(wod);
  const url = await postToCafe('wod', subject, body);
  const mark = await sb.rpc('cafe_wod_mark', { p_secret: config.pushSecret, p_date: wod.wod_date, p_url: url });
  if (mark.error) console.warn('[naver] 카페 WOD 주소를 기록하지 못했어요', mark.error.code);
  console.log('[naver] 카페 WOD 등록', wod.wod_date);
  return url;
}

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
export async function postToCafe(menuKey, subject, bodyText, { html = false } = {}) {
  const menuId = CAFE_MENUS[menuKey];
  if (!menuId) throw new Error('올릴 카페 게시판이 올바르지 않아요');
  const token = await accessToken();
  // html: 이미 HTML로 만든 본문 (WOD처럼 굵은 제목이 필요한 글). 아니면 글자를 안전하게 바꾸고 줄바꿈만
  const toHtml = (t) => `${html ? t : escapeHtml(t).replace(/\r?\n/g, '<br>')}<br><br>(051 BOX 앱에서 올린 글입니다)`;
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
  const head = wod.title && !/WOD$/.test(wod.title) ? [wod.title, ''] : [];
  const lines = wod.content ? String(wod.content).split(/\r\n|\r|\n/) : [];
  const lifts = Array.isArray(wod.lifts) ? wod.lifts : [];
  if (lifts.length) {
    const block = lifts.map((l) => `강도: ${LABELS[l.movement] ?? l.movement} ${(l.percents ?? []).map(percentText).join(', ')}`);
    // [Strength] 구역 끝(다음 [구역] 제목 바로 앞, 빈 줄 앞)에 넣는다. [Strength]가 없으면 맨 끝
    const section = /^\s*\[[^\]]{1,30}\]\s*$/;
    const start = lines.findIndex((l) => /^\s*\[\s*(strength|스트렝스)[^\]]*\]\s*$/i.test(l));
    if (start >= 0) {
      const next = lines.findIndex((l, i) => i > start && section.test(l));
      let end = next < 0 ? lines.length : next;
      while (end > start + 1 && !lines[end - 1].trim()) end -= 1;
      lines.splice(end, 0, '', ...block); // 동작과 [강도] 사이 한 줄 띄움
    } else {
      lines.push('', ...block);
    }
  }
  const all = [...head, ...lines];
  // 카페 글: [Strength] → 굵은 Strength (대괄호 없이, 카페에서 직접 쓰던 모양). 나머지 글자는 안전하게 바꾼다
  // 제목 줄 다음에는 카페 글처럼 한 줄 띄운다 (이미 빈 줄이면 그대로)
  const html = all
    .map((l, i) => {
      const m = l.match(/^\s*\[([^\]]{1,30})\]\s*$/);
      if (!m) return escapeHtml(l);
      const gap = all[i + 1] !== undefined && all[i + 1].trim() ? '<br>' : '';
      return `<b>${escapeHtml(m[1].trim())}</b>${gap}`;
    })
    .join('<br>');
  return { subject, body: all.join('\n'), html };
}

// 20:30 공개 때 부른다: 자동 등록이 켜져 있고 아직 안 올린 내일 WOD만 (하루 한 번)
export async function autoPostWodToCafe() {
  if (!naverEnabled()) return null;
  const { data, error } = await sb.rpc('cafe_wod_pending', { p_secret: config.pushSecret });
  if (error) throw new Error(`카페 WOD 대상을 불러오지 못했어요 (${error.code})`);
  const wod = data?.[0];
  if (!wod) return null;
  const { subject, html } = wodCafePost(wod);
  const url = await postToCafe('wod', subject, html, { html: true });
  const mark = await sb.rpc('cafe_wod_mark', { p_secret: config.pushSecret, p_date: wod.wod_date, p_url: url });
  if (mark.error) console.warn('[naver] 카페 WOD 주소를 기록하지 못했어요', mark.error.code);
  console.log('[naver] 카페 WOD 등록', wod.wod_date);
  return url;
}

// ---- 기록 사진 → 카페 RECORD 게시판 (사진 첨부)
// 사진이 있으면 multipart로 보낸다. 네이버 공식 예제는 multipart일 때 제목·본문을 한 번만 인코딩한다.
// 형식 문제(999)면 ① 한 번 인코딩 ② 인코딩 없이 ③ 두 번 인코딩 순서로 자동 재시도한다.
async function tryPostMultipart(token, menuId, subject, content, enc, images) {
  const form = new FormData();
  form.append('subject', enc(subject));
  form.append('content', enc(content));
  images.forEach((img, i) => form.append('image', new Blob([img.buffer], { type: img.type }), img.name || `record-${i + 1}.jpg`));
  const res = await fetch(`https://openapi.naver.com/v1/cafe/${CAFE_ID}/menu/${menuId}/articles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  const articleId = data?.message?.result?.articleId;
  if (res.ok && articleId) return { articleId };
  const err = data?.message?.error ?? {};
  return {
    status: res.status,
    code: String(err.code ?? data?.errorCode ?? ''),
    reason: String(err.msg ?? err.message ?? data?.errorMessage ?? `HTTP ${res.status}`).slice(0, 120),
  };
}

export async function postToCafeWithImages(menuKey, subject, bodyText, images) {
  const menuId = CAFE_MENUS[menuKey];
  if (!menuId) throw new Error('올릴 카페 게시판이 올바르지 않아요');
  if (!images.length) return postToCafe(menuKey, subject, bodyText);
  const token = await accessToken();
  const content = `${escapeHtml(bodyText).replace(/\r?\n/g, '<br>')}<br><br>(051 BOX 앱에서 올린 글입니다)`;
  const raw = (v) => v;
  const attempts = [
    { s: subject, c: content, enc: encSingle },
    { s: stripEmoji(subject), c: stripEmoji(content), enc: raw },
    { s: stripEmoji(subject), c: stripEmoji(content), enc: encDouble },
  ];
  let last = null;
  for (const [i, a] of attempts.entries()) {
    const r = await tryPostMultipart(token, menuId, a.s, a.c, a.enc, images);
    if (r.articleId) {
      if (i > 0) console.warn(`[naver] 사진 글쓰기 ${i + 1}번째 방식으로 성공`);
      return `${CAFE_URL_BASE}/${r.articleId}`;
    }
    last = r;
    console.warn('[naver] 사진 글쓰기 실패', i + 1, r.status, r.code, r.reason);
    if (r.status === 401) break;
  }
  throw new Error(`네이버가 거절했어요 (${last.status}${last.code ? ` · ${last.code}` : ''}: ${last.reason})`);
}

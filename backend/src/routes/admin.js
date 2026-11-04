import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { chatLockSchema, chatMuteSchema, holidaySchema, isoDate, roleSchema, sheetUrlSchema, uuid } from '../schemas.js';
import { fetchSheetCsv, normalizeSheetUrl, parseCsv, rowsToWods } from '../sheet.js';

export const adminRouter = Router();

adminRouter.get('/members', async (req, res) => {
  const members = unwrap(
    await req.sb
      .from('profiles')
      .select('id, nickname, role, avatar, created_at, chat_muted_until')
      .order('role', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1000),
  );
  res.json({ members });
});

// 가입 승인 / 역할 변경. 자기 자신은 바꿀 수 없다(DB 트리거도 막음).
adminRouter.patch('/members/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { role } = roleSchema.parse(req.body);
  if (id === req.userId) throw new HttpError(400, '자신의 권한은 변경할 수 없습니다');
  const member = unwrap(
    await req.sb.from('profiles').update({ role }).eq('id', id).select('id, nickname, role').maybeSingle(),
  );
  if (!member) throw new HttpError(404, '회원을 찾을 수 없습니다');
  res.json({ member });
});

// 회원이 올린 기록 (관리자 정리용): 1RM 기록과 직접 만든 모임
adminRouter.get('/members/:id/records', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const [oneRm, gatherings] = await Promise.all([
    req.sb
      .from('one_rm_records')
      .select('id, movement, is_custom, unit, weight_lb, time_sec, achieved_on, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
    req.sb
      .from('events')
      .select('id, title, starts_at, created_at')
      .eq('created_by', id)
      .eq('kind', 'gathering')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  res.json({ oneRm: unwrap(oneRm), gatherings: unwrap(gatherings) });
});

// 회원이 올린 기록 전체 삭제 (1RM·PR 글·채팅·만든 모임·참가 신청·출석). 되돌릴 수 없다
adminRouter.delete('/members/:id/records', async (req, res) => {
  const id = uuid.parse(req.params.id);
  if (id === req.userId) throw new HttpError(400, '내 기록은 여기서 지울 수 없어요');
  const removed = unwrap(await req.sb.rpc('admin_purge_member_records', { target: id }));
  res.json({ removed });
});

// 회원의 1RM 기록 삭제 (PR 축하 글도 DB에서 함께 삭제)
adminRouter.delete('/one-rm/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('one_rm_records').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new HttpError(404, '기록을 찾을 수 없습니다');
  res.status(204).end();
});

adminRouter.get('/holidays', async (req, res) => {
  const holidays = unwrap(await req.sb.from('holidays').select('day, name').order('day').limit(1000));
  res.json({ holidays });
});

adminRouter.post('/holidays', async (req, res) => {
  const body = holidaySchema.parse(req.body);
  const holiday = unwrap(await req.sb.from('holidays').insert(body).select('day, name').single());
  res.status(201).json({ holiday });
});

adminRouter.delete('/holidays/:day', async (req, res) => {
  const day = isoDate.parse(req.params.day);
  unwrap(await req.sb.from('holidays').delete().eq('day', day));
  res.status(204).end();
});

// ---- 구글 시트 WOD 가져오기 ----
function kstDate(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

adminRouter.get('/sheet', async (req, res) => {
  const row = unwrap(
    await req.sb.from('app_settings').select('value, updated_at').eq('key', 'wod_sheet_url').maybeSingle(),
  );
  res.json({ url: row?.value ?? null, updated_at: row?.updated_at ?? null });
});

adminRouter.put('/sheet', async (req, res) => {
  const { url } = sheetUrlSchema.parse(req.body);
  const value = normalizeSheetUrl(url);
  unwrap(
    await req.sb
      .from('app_settings')
      .upsert({ key: 'wod_sheet_url', value, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
  );
  res.json({ url: value });
});

// 시트를 읽어서 최근 7일 ~ 앞으로 60일 사이 WOD를 날짜 기준으로 작성/수정한다 (관리자 권한으로 RLS 적용)
adminRouter.post('/sheet/import', async (req, res) => {
  const row = unwrap(await req.sb.from('app_settings').select('value').eq('key', 'wod_sheet_url').maybeSingle());
  if (!row?.value) throw new HttpError(400, '먼저 구글 시트 주소를 저장해주세요');

  const csv = await fetchSheetCsv(normalizeSheetUrl(row.value));
  const range = { from: kstDate(-7), to: kstDate(60) };
  const { wods, skipped } = rowsToWods(parseCsv(csv), range);

  const existing = wods.length
    ? unwrap(await req.sb.from('wods').select('wod_date').in('wod_date', wods.map((w) => w.wod_date)))
    : [];
  const existingDates = new Set(existing.map((w) => w.wod_date));
  if (wods.length) unwrap(await req.sb.from('wods').upsert(wods, { onConflict: 'wod_date' }));

  res.json({
    range,
    created: wods.filter((w) => !existingDates.has(w.wod_date)).map((w) => w.wod_date),
    updated: wods.filter((w) => existingDates.has(w.wod_date)).map((w) => w.wod_date),
    skipped,
  });
});

// ---- 채팅 관리 ----
// 회원별 채팅 제한: 1시간 / 오늘 하루(한국 시간 자정까지) / 해제
adminRouter.patch('/members/:id/chat', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { mute } = chatMuteSchema.parse(req.body);
  if (id === req.userId) throw new HttpError(400, '자신의 채팅은 제한할 수 없어요');
  const until =
    mute === 'off' ? null : mute === '1h' ? new Date(Date.now() + 3600_000).toISOString() : `${kstDate(1)}T00:00:00+09:00`;
  const member = unwrap(
    await req.sb.from('profiles').update({ chat_muted_until: until }).eq('id', id).select('id, nickname, chat_muted_until').maybeSingle(),
  );
  if (!member) throw new HttpError(404, '회원을 찾을 수 없습니다');
  res.json({ member });
});

// 전체 채팅 잠금 (관리자는 잠금 중에도 공지성 메시지를 쓸 수 있다)
adminRouter.get('/chat-lock', async (req, res) => {
  res.json({ locked: Boolean(unwrap(await req.sb.rpc('chat_locked'))) });
});

adminRouter.put('/chat-lock', async (req, res) => {
  const { locked } = chatLockSchema.parse(req.body);
  unwrap(
    await req.sb
      .from('app_settings')
      .upsert({ key: 'chat_locked', value: String(locked), updated_at: new Date().toISOString() }, { onConflict: 'key' }),
  );
  res.json({ locked });
});

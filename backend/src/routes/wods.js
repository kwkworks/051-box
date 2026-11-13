import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireAdmin } from '../auth.js';
import { HttpError, fromDbError, unwrap } from '../errors.js';
import { isoDate, photoOrderSchema, uuid, wodSchema } from '../schemas.js';
import { naverEnabled, postToCafe, postToCafeWithImages, wodCafePost } from '../naver.js';
import { z } from 'zod';

export const wodsRouter = Router();

const BUCKET = 'wod-photos';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// 확장자/MIME이 아니라 파일 앞부분(매직 바이트)으로 실제 이미지인지 확인한다.
function detectImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', type: 'image/png' };
  }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' };
  }
  return null;
}

// WOD 공개 시각: 전날 오후 8시 30분 (한국 시간). 실제 차단은 DB(RLS)가 하고, 여기서는 안내용 시각만 알려준다.
function releaseAt(date) {
  const d = new Date(`${date}T20:30:00+09:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

// 날짜별 WOD + 기록 사진(1시간짜리 서명 URL)
wodsRouter.get('/', async (req, res) => {
  const date = isoDate.parse(req.query.date);
  const opensAt = releaseAt(date);
  const released = Date.now() >= opensAt.getTime();
  if (!released && req.profile.role !== 'admin') {
    return res.json({ wod: null, photos: [], locked: true, opensAt: opensAt.toISOString() });
  }
  const wod = unwrap(
    await req.sb.from('wods').select('id, wod_date, title, content, lifts, cafe_url, record_cafe_url, updated_at').eq('wod_date', date).maybeSingle(),
  );
  if (!wod) return res.json({ wod: null, photos: [], locked: false, opensAt: opensAt.toISOString(), released });

  const rows = unwrap(
    await req.sb
      .from('wod_photos')
      .select('id, storage_path, created_at, sort_order')
      .eq('wod_id', wod.id)
      .order('sort_order')
      .order('created_at'),
  );
  let photos = [];
  if (rows.length) {
    const signed = unwrap(await req.sb.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600));
    photos = rows.map((r, i) => ({ id: r.id, url: signed[i]?.signedUrl ?? null, created_at: r.created_at }));
  }
  res.json({ wod, photos, locked: false, opensAt: opensAt.toISOString(), released });
});

// 날짜 기준으로 작성/수정 (관리자)
wodsRouter.put('/:date', requireAdmin, async (req, res) => {
  const wod_date = isoDate.parse(req.params.date);
  const body = wodSchema.parse(req.body);
  const wod = unwrap(
    await req.sb
      .from('wods')
      .upsert({ ...body, wod_date }, { onConflict: 'wod_date' })
      .select('id, wod_date, title, content, lifts, cafe_url, record_cafe_url, updated_at')
      .single(),
  );
  res.json({ wod });
});

// 관리자: 이 WOD를 지금 카페 WOD 게시판에 올리기 (자동 등록을 껐거나 놓쳤을 때). 한 WOD는 한 번만
wodsRouter.post('/:date/cafe', requireAdmin, async (req, res) => {
  const date = isoDate.parse(req.params.date);
  if (!naverEnabled()) throw new HttpError(400, '네이버 카페 연동이 아직 설정되지 않았어요');
  const wod = unwrap(await req.sb.from('wods').select('wod_date, title, content, lifts, cafe_url').eq('wod_date', date).maybeSingle());
  if (!wod) throw new HttpError(404, '이 날짜의 WOD가 없어요');
  if (wod.cafe_url) throw new HttpError(409, '이미 카페에 올린 WOD예요');
  const { subject, html } = wodCafePost(wod);
  let url;
  try {
    url = await postToCafe('wod', subject, html, { html: true });
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : '카페에 올리지 못했어요');
  }
  unwrap(await req.sb.from('wods').update({ cafe_url: url }).eq('wod_date', date));
  res.json({ cafe_url: url });
});

// 관리자: 그날 기록 사진을 카페 RECORD 게시판에 올리기. 제목은 카페에서 쓰던 모양 "2026_11_13 기록(○○님👑 보세요)"
const recordCafeSchema = z.strictObject({ note: z.string().trim().max(60).optional() });
wodsRouter.post('/:date/record-cafe', requireAdmin, async (req, res) => {
  const date = isoDate.parse(req.params.date);
  const { note } = recordCafeSchema.parse(req.body ?? {});
  if (!naverEnabled()) throw new HttpError(400, '네이버 카페 연동이 아직 설정되지 않았어요');
  const wod = unwrap(await req.sb.from('wods').select('id, record_cafe_url').eq('wod_date', date).maybeSingle());
  if (!wod) throw new HttpError(404, '이 날짜의 WOD가 없어요');
  if (wod.record_cafe_url) throw new HttpError(409, '이미 카페 RECORD에 올린 기록이에요');
  const photos = unwrap(
    await req.sb.from('wod_photos').select('storage_path').eq('wod_id', wod.id).order('sort_order').order('created_at').limit(10),
  );
  if (!photos.length) throw new HttpError(400, '올릴 기록 사진이 없어요. 먼저 사진을 올려 주세요');
  const images = [];
  for (const [i, p] of photos.entries()) {
    const { data, error } = await req.sb.storage.from(BUCKET).download(p.storage_path);
    if (error || !data) throw new HttpError(502, '기록 사진을 불러오지 못했어요');
    images.push({ buffer: Buffer.from(await data.arrayBuffer()), type: data.type || 'image/jpeg', name: `record-${i + 1}.${p.storage_path.split('.').pop()}` });
  }
  const subject = `${date.replace(/-/g, '_')} 기록${note ? `(${note})` : ''}`;
  let url;
  try {
    url = await postToCafeWithImages('record', subject, `${date.replace(/-/g, '.')} 기록입니다`, images);
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : '카페에 올리지 못했어요');
  }
  unwrap(await req.sb.from('wods').update({ record_cafe_url: url }).eq('id', wod.id));
  res.json({ record_cafe_url: url });
});

wodsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const photos = unwrap(await req.sb.from('wod_photos').select('storage_path').eq('wod_id', id));
  if (photos.length) unwrap(await req.sb.storage.from(BUCKET).remove(photos.map((p) => p.storage_path)));
  unwrap(await req.sb.from('wods').delete().eq('id', id));
  res.status(204).end();
});

// 화이트보드 기록 사진 업로드 (관리자, 이미지 5MB 이하)
wodsRouter.post('/:id/photos', requireAdmin, upload.single('photo'), async (req, res) => {
  const wodId = uuid.parse(req.params.id);
  if (!req.file) throw new HttpError(400, '사진을 선택해주세요');
  const image = detectImage(req.file.buffer);
  if (!image) throw new HttpError(400, 'JPG, PNG, WEBP 사진만 올릴 수 있어요');

  const wod = unwrap(await req.sb.from('wods').select('id').eq('id', wodId).maybeSingle());
  if (!wod) throw new HttpError(404, 'WOD를 찾을 수 없습니다');

  const path = `wods/${wodId}/${randomUUID()}.${image.ext}`;
  unwrap(await req.sb.storage.from(BUCKET).upload(path, req.file.buffer, { contentType: image.type, upsert: false }));
  // 새 사진은 맨 뒤에
  const { data: last } = await req.sb
    .from('wod_photos')
    .select('sort_order')
    .eq('wod_id', wodId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await req.sb
    .from('wod_photos')
    .insert({ wod_id: wodId, storage_path: path, sort_order: (last?.sort_order ?? 0) + 1 })
    .select('id')
    .single();
  if (error) {
    await req.sb.storage.from(BUCKET).remove([path]);
    throw fromDbError(error);
  }
  res.status(201).json({ photo: data });
});

// 기록 사진 순서 바꾸기 (관리자): 보여줄 순서대로 사진 id 목록을 받는다
wodsRouter.put('/:id/photos/order', requireAdmin, async (req, res) => {
  const wodId = uuid.parse(req.params.id);
  const { ids } = photoOrderSchema.parse(req.body);
  const rows = unwrap(await req.sb.from('wod_photos').select('id').eq('wod_id', wodId));
  const known = new Set(rows.map((r) => r.id));
  if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
    throw new HttpError(400, '사진 목록이 바뀌었어요. 새로고침 후 다시 해주세요');
  }
  for (const [i, id] of ids.entries()) {
    unwrap(await req.sb.from('wod_photos').update({ sort_order: i + 1 }).eq('id', id).eq('wod_id', wodId));
  }
  res.status(204).end();
});

wodsRouter.delete('/:id/photos/:photoId', requireAdmin, async (req, res) => {
  const wodId = uuid.parse(req.params.id);
  const photoId = uuid.parse(req.params.photoId);
  const photo = unwrap(
    await req.sb.from('wod_photos').select('id, storage_path').eq('id', photoId).eq('wod_id', wodId).maybeSingle(),
  );
  if (!photo) throw new HttpError(404, '사진을 찾을 수 없습니다');
  unwrap(await req.sb.storage.from(BUCKET).remove([photo.storage_path]));
  unwrap(await req.sb.from('wod_photos').delete().eq('id', photo.id));
  res.status(204).end();
});

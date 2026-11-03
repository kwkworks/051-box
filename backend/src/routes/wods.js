import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireAdmin } from '../auth.js';
import { HttpError, fromDbError, unwrap } from '../errors.js';
import { isoDate, uuid, wodSchema } from '../schemas.js';

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

// 날짜별 WOD + 기록 사진(1시간짜리 서명 URL)
wodsRouter.get('/', async (req, res) => {
  const date = isoDate.parse(req.query.date);
  const wod = unwrap(
    await req.sb.from('wods').select('id, wod_date, title, content, lifts, updated_at').eq('wod_date', date).maybeSingle(),
  );
  if (!wod) return res.json({ wod: null, photos: [] });

  const rows = unwrap(
    await req.sb.from('wod_photos').select('id, storage_path, created_at').eq('wod_id', wod.id).order('created_at'),
  );
  let photos = [];
  if (rows.length) {
    const signed = unwrap(await req.sb.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600));
    photos = rows.map((r, i) => ({ id: r.id, url: signed[i]?.signedUrl ?? null, created_at: r.created_at }));
  }
  res.json({ wod, photos });
});

// 날짜 기준으로 작성/수정 (관리자)
wodsRouter.put('/:date', requireAdmin, async (req, res) => {
  const wod_date = isoDate.parse(req.params.date);
  const body = wodSchema.parse(req.body);
  const wod = unwrap(
    await req.sb
      .from('wods')
      .upsert({ ...body, wod_date }, { onConflict: 'wod_date' })
      .select('id, wod_date, title, content, lifts, updated_at')
      .single(),
  );
  res.json({ wod });
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
  const { data, error } = await req.sb.from('wod_photos').insert({ wod_id: wodId, storage_path: path }).select('id').single();
  if (error) {
    await req.sb.storage.from(BUCKET).remove([path]);
    throw fromDbError(error);
  }
  res.status(201).json({ photo: data });
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

import { Router } from 'express';
import { sendPushLater } from '../push.js';
import { requireAdmin } from '../auth.js';
import { HttpError, unwrap } from '../errors.js';
import { noticeCreateSchema, noticeUpdateSchema, uuid } from '../schemas.js';
import { naverEnabled, normalizeCafeUrl, postToCafe } from '../naver.js';

export const noticesRouter = Router();

const COLUMNS = 'id, title, body, pinned, cafe_url, created_at, updated_at';

// 카페 주소를 우리 카페 글 주소 모양으로. 빈 값이면 null, 다른 주소면 오류
function cafeUrlOrThrow(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const url = normalizeCafeUrl(v);
  if (!url) throw new HttpError(400, '크로스핏051 네이버 카페 글 주소가 아니에요');
  return url;
}

noticesRouter.get('/', async (req, res) => {
  const notices = unwrap(
    await req.sb
      .from('notices')
      .select(COLUMNS)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
  );
  res.json({ notices });
});

noticesRouter.post('/', requireAdmin, async (req, res) => {
  const { post_to_cafe, ...input } = noticeCreateSchema.parse(req.body);
  const cafe_url = cafeUrlOrThrow(input.cafe_url);
  const result = await req.sb.from('notices').insert({ ...input, cafe_url: cafe_url ?? null }).select(COLUMNS).single();
  if (result.error?.code === '23505') throw new HttpError(409, '이미 앱에 가져온 카페 글이에요');
  let notice = unwrap(result);
  sendPushLater('notices', notice.id, req.userId, { title: '📢 새 공지사항', body: notice.title, url: '/notices' });

  // B. 카페에도 올리기 (카페에서 가져온 글은 다시 올리지 않는다). 실패해도 앱 공지는 그대로 남긴다
  let cafe_error = null;
  if (post_to_cafe && !notice.cafe_url) {
    if (!naverEnabled()) {
      cafe_error = '네이버 카페 연동이 아직 설정되지 않았어요';
    } else {
      try {
        const url = await postToCafe(post_to_cafe, notice.title, notice.body);
        notice = unwrap(await req.sb.from('notices').update({ cafe_url: url }).eq('id', notice.id).select(COLUMNS).single());
      } catch (e) {
        cafe_error = e instanceof Error ? e.message : '카페에 올리지 못했어요';
      }
    }
  }
  res.status(201).json({ notice, cafe_error });
});

noticesRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = noticeUpdateSchema.parse(req.body);
  if (!Object.keys(body).length) throw new HttpError(400, '변경할 내용이 없습니다');
  if ('cafe_url' in body) body.cafe_url = cafeUrlOrThrow(body.cafe_url);
  const result = await req.sb.from('notices').update(body).eq('id', id).select(COLUMNS).maybeSingle();
  if (result.error?.code === '23505') throw new HttpError(409, '이미 다른 공지에 연결된 카페 글이에요');
  const notice = unwrap(result);
  if (!notice) throw new HttpError(404, '공지를 찾을 수 없습니다');
  res.json({ notice });
});

noticesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  unwrap(await req.sb.from('notices').delete().eq('id', id));
  res.status(204).end();
});

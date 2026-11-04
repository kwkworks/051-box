import { Router } from 'express';
import { sendPushLater } from '../push.js';
import { requireAdmin } from '../auth.js';
import { HttpError, unwrap } from '../errors.js';
import { noticeSchema, noticeUpdateSchema, uuid } from '../schemas.js';

export const noticesRouter = Router();

const COLUMNS = 'id, title, body, pinned, created_at, updated_at';

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
  const body = noticeSchema.parse(req.body);
  const notice = unwrap(await req.sb.from('notices').insert(body).select(COLUMNS).single());
  sendPushLater('notices', notice.id, req.userId, { title: '📢 새 공지사항', body: notice.title, url: '/notices' });
  res.status(201).json({ notice });
});

noticesRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = noticeUpdateSchema.parse(req.body);
  if (!Object.keys(body).length) throw new HttpError(400, '변경할 내용이 없습니다');
  const notice = unwrap(await req.sb.from('notices').update(body).eq('id', id).select(COLUMNS).maybeSingle());
  if (!notice) throw new HttpError(404, '공지를 찾을 수 없습니다');
  res.json({ notice });
});

noticesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = uuid.parse(req.params.id);
  unwrap(await req.sb.from('notices').delete().eq('id', id));
  res.status(204).end();
});

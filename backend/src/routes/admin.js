import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { holidaySchema, isoDate, roleSchema, uuid } from '../schemas.js';

export const adminRouter = Router();

adminRouter.get('/members', async (req, res) => {
  const members = unwrap(
    await req.sb
      .from('profiles')
      .select('id, nickname, role, avatar, created_at')
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

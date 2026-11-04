import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { chatReadSchema, chatSchema, uuid } from '../schemas.js';

export const chatRouter = Router();

// 오늘(한국 시간 0시부터) 대화 전체 + 내가 어디까지 읽었는지 + 잠금/제한 상태
chatRouter.get('/', async (req, res) => {
  const [rows, me, locked] = await Promise.all([
    req.sb
      .from('chat_messages')
      .select('id, user_id, body, created_at, profiles(nickname, role)')
      .order('created_at', { ascending: false })
      .limit(300),
    req.sb.from('profiles').select('chat_read_at').eq('id', req.userId).single(),
    req.sb.rpc('chat_locked'),
  ]);
  res.json({
    messages: unwrap(rows)
      .reverse()
      .map(({ profiles, ...m }) => ({ ...m, nickname: profiles?.nickname ?? '알 수 없음', role: profiles?.role ?? 'member' })),
    readAt: unwrap(me)?.chat_read_at ?? null,
    locked: Boolean(unwrap(locked)),
    mutedUntil: req.profile.chat_muted_until ?? null,
  });
});

// 어디까지 읽었는지 저장 (앞으로만 움직인다. DB 함수가 본인 것만 바꾼다)
chatRouter.post('/read', async (req, res) => {
  const { at } = chatReadSchema.parse(req.body);
  const readAt = unwrap(await req.sb.rpc('chat_mark_read', { at }));
  res.json({ readAt });
});

chatRouter.post('/', async (req, res) => {
  const { body } = chatSchema.parse(req.body);
  const message = unwrap(
    await req.sb.from('chat_messages').insert({ body }).select('id, user_id, body, created_at').single(),
  );
  res.status(201).json({ message: { ...message, nickname: req.profile.nickname, role: req.profile.role } });
});

// 본인 메시지 또는 관리자(부적절한 메시지 정리)
chatRouter.delete('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('chat_messages').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new HttpError(404, '메시지를 찾을 수 없거나 삭제할 권한이 없어요');
  res.status(204).end();
});

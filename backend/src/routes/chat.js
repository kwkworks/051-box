import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { chatSchema, uuid } from '../schemas.js';

export const chatRouter = Router();

// 박스에 들어오면 접속 기록을 시작한다. 이 접속 동안 오간 대화만 볼 수 있다 (DB RLS가 강제).
chatRouter.post('/session', async (req, res) => {
  const id = unwrap(await req.sb.rpc('chat_session_start'));
  res.status(201).json({ id });
});

// 30초마다 갱신. 90초 넘게 끊겼으면 alive=false → 새 접속을 시작해야 한다.
chatRouter.post('/session/:id/ping', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const alive = unwrap(await req.sb.rpc('chat_session_ping', { sid: id }));
  res.json({ alive: Boolean(alive) });
});

// 오늘 대화 중 내가 접속해 있던 동안의 것 + 오늘 내 접속 기록(구분선용) + 잠금/제한 상태
chatRouter.get('/', async (req, res) => {
  const [rows, sessions, locked] = await Promise.all([
    req.sb
      .from('chat_messages')
      .select('id, user_id, body, created_at, profiles(nickname)')
      .order('created_at', { ascending: false })
      .limit(300),
    req.sb.from('chat_sessions').select('id, started_at, last_seen').order('started_at'),
    req.sb.rpc('chat_locked'),
  ]);
  res.json({
    messages: unwrap(rows)
      .reverse()
      .map(({ profiles, ...m }) => ({ ...m, nickname: profiles?.nickname ?? '알 수 없음' })),
    sessions: unwrap(sessions),
    locked: Boolean(unwrap(locked)),
    mutedUntil: req.profile.chat_muted_until ?? null,
  });
});

chatRouter.post('/', async (req, res) => {
  const { body } = chatSchema.parse(req.body);
  const message = unwrap(
    await req.sb.from('chat_messages').insert({ body }).select('id, user_id, body, created_at').single(),
  );
  res.status(201).json({ message: { ...message, nickname: req.profile.nickname } });
});

// 본인 메시지 또는 관리자(부적절한 메시지 정리)
chatRouter.delete('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('chat_messages').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new HttpError(404, '메시지를 찾을 수 없거나 삭제할 권한이 없어요');
  res.status(204).end();
});

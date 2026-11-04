import { Router } from 'express';
import { sendPushLater } from '../push.js';
import { z } from 'zod';
import { HttpError, unwrap } from '../errors.js';
import { eventSchema, uuid } from '../schemas.js';

export const eventsRouter = Router();

const COLUMNS = 'id, kind, title, description, starts_at, location, link_url, signup_deadline, capacity, created_by, created_at';

// 목록: 참가 인원 수와 내 참가 여부 포함. 기본은 오늘 이후 일정.
eventsRouter.get('/', async (req, res) => {
  const kind = z.enum(['competition', 'event', 'gathering']).optional().parse(req.query.kind);
  const past = req.query.past === '1';
  let query = req.sb
    .from('events')
    .select(`${COLUMNS}, event_participants(count)`)
    .order('starts_at', { ascending: !past })
    .limit(100);
  if (kind) query = query.eq('kind', kind);
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  query = past ? query.lt('starts_at', since) : query.gte('starts_at', since);
  const rows = unwrap(await query);

  const mine = unwrap(await req.sb.from('event_participants').select('event_id').eq('user_id', req.userId));
  const joined = new Set(mine.map((m) => m.event_id));

  res.json({
    events: rows.map(({ event_participants, ...ev }) => ({
      ...ev,
      participant_count: event_participants?.[0]?.count ?? 0,
      joined: joined.has(ev.id),
    })),
  });
});

eventsRouter.get('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const event = unwrap(
    await req.sb
      .from('events')
      .select(`${COLUMNS}, creator:profiles!events_created_by_fkey(nickname), event_participants(user_id, created_at, profiles(nickname, avatar))`)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!event) throw new HttpError(404, '일정을 찾을 수 없습니다');
  const { event_participants, ...rest } = event;
  const participants = (event_participants ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => ({ user_id: p.user_id, nickname: p.profiles?.nickname ?? '알 수 없음', avatar: p.profiles?.avatar ?? {}, created_at: p.created_at }));
  res.json({
    event: {
      ...rest,
      participants,
      joined: participants.some((p) => p.user_id === req.userId),
      can_manage: req.profile.role === 'admin' || rest.created_by === req.userId,
    },
  });
});

// 대회/이벤트는 관리자만, 모임은 회원 누구나. (DB RLS도 같은 규칙을 강제)
eventsRouter.post('/', async (req, res) => {
  const body = eventSchema.parse(req.body);
  if (body.kind !== 'gathering' && req.profile.role !== 'admin') {
    throw new HttpError(403, '대회와 이벤트는 관리자만 등록할 수 있어요');
  }
  const event = unwrap(await req.sb.from('events').insert(body).select(COLUMNS).single());
  const gathering = event.kind === 'gathering';
  sendPushLater(gathering ? 'gathering' : 'competition', event.id, req.userId, {
    title: gathering ? '🍻 새 회원 모임' : event.kind === 'competition' ? '🏆 새 대회' : '🎉 새 이벤트',
    body: event.title,
    url: `/events/${event.id}`,
  });
  res.status(201).json({ event });
});

eventsRouter.delete('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('events').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new HttpError(403, '삭제할 권한이 없거나 이미 삭제되었습니다');
  res.status(204).end();
});

// 참가 신청 / 취소. 정원과 마감은 DB 트리거가 검사한다.
eventsRouter.post('/:id/join', async (req, res) => {
  const event_id = uuid.parse(req.params.id);
  unwrap(await req.sb.from('event_participants').insert({ event_id }));
  res.status(201).json({ joined: true });
});

eventsRouter.delete('/:id/join', async (req, res) => {
  const event_id = uuid.parse(req.params.id);
  unwrap(await req.sb.from('event_participants').delete().eq('event_id', event_id).eq('user_id', req.userId));
  res.json({ joined: false });
});

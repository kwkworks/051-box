import { Router } from 'express';
import { fromDbError, unwrap } from '../errors.js';
import { uuid } from '../schemas.js';

export const feedRouter = Router();

// 명예의 벽: 오늘(한국 시간) 세운 PR만 보여준다 (DB 트리거만 기록하므로 위조할 수 없다)
feedRouter.get('/', async (req, res) => {
  const rows = unwrap(
    await req.sb
      .from('activities')
      .select('id, kind, payload, created_at, user_id, profiles(nickname, avatar), activity_likes(user_id)')
      .gte('created_at', `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())}T00:00:00+09:00`)
      .order('created_at', { ascending: false })
      .limit(100),
  );
  res.json({
    items: rows.map(({ profiles, activity_likes, ...a }) => ({
      ...a,
      nickname: profiles?.nickname ?? '알 수 없음',
      avatar: profiles?.avatar ?? {},
      like_count: activity_likes?.length ?? 0,
      liked: (activity_likes ?? []).some((l) => l.user_id === req.userId),
    })),
  });
});

// 축하해요 🎉 누르기 / 취소. 한 사람이 한 글에 한 번 (DB 기본 키와 RLS가 강제)
feedRouter.post('/:id/like', async (req, res) => {
  const activity_id = uuid.parse(req.params.id);
  const { error } = await req.sb.from('activity_likes').insert({ activity_id });
  if (error && error.code !== '23505') throw fromDbError(error); // 이미 누른 경우는 그대로 성공
  res.status(201).json({ liked: true });
});

feedRouter.delete('/:id/like', async (req, res) => {
  const activity_id = uuid.parse(req.params.id);
  unwrap(await req.sb.from('activity_likes').delete().eq('activity_id', activity_id).eq('user_id', req.userId));
  res.json({ liked: false });
});

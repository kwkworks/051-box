import { Router } from 'express';
import { fromDbError, unwrap } from '../errors.js';
import { uuid } from '../schemas.js';

export const feedRouter = Router();

// 명예의 벽: 오늘(한국 시간) 세운 PR만 보여준다 (DB 트리거만 기록하므로 위조할 수 없다)
feedRouter.get('/', async (req, res) => {
  const rows = unwrap(
    await req.sb
      .from('activities')
      .select('id, kind, payload, created_at, user_id, profiles(nickname, avatar)')
      .gte('created_at', `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())}T00:00:00+09:00`)
      .order('created_at', { ascending: false })
      .limit(100),
  );

  // 축하해요 🎉는 따로 불러온다 (표 사이 연결 정보에 기대지 않음).
  // 불러오지 못해도 명예의 벽은 그대로 보여주고 축하 수만 0으로 둔다.
  const counts = new Map();
  const mine = new Set();
  if (rows.length) {
    const { data: likes, error } = await req.sb
      .from('activity_likes')
      .select('activity_id, user_id')
      .in('activity_id', rows.map((r) => r.id))
      .limit(5000);
    if (error) {
      console.warn('[feed] 축하 수를 불러오지 못했어요', error.code);
    } else {
      for (const l of likes) {
        counts.set(l.activity_id, (counts.get(l.activity_id) ?? 0) + 1);
        if (l.user_id === req.userId) mine.add(l.activity_id);
      }
    }
  }

  res.json({
    items: rows.map(({ profiles, ...a }) => ({
      ...a,
      nickname: profiles?.nickname ?? '알 수 없음',
      avatar: profiles?.avatar ?? {},
      like_count: counts.get(a.id) ?? 0,
      liked: mine.has(a.id),
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

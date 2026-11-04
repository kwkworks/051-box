import { Router } from 'express';
import { unwrap } from '../errors.js';

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
  res.json({
    items: rows.map(({ profiles, ...a }) => ({ ...a, nickname: profiles?.nickname ?? '알 수 없음', avatar: profiles?.avatar ?? {} })),
  });
});

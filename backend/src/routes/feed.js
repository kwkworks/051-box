import { Router } from 'express';
import { unwrap } from '../errors.js';

export const feedRouter = Router();

// 명예의 벽: PR 축하 피드 (DB 트리거만 기록하므로 위조할 수 없다)
feedRouter.get('/', async (req, res) => {
  const rows = unwrap(
    await req.sb
      .from('activities')
      .select('id, kind, payload, created_at, user_id, profiles(nickname, avatar)')
      .order('created_at', { ascending: false })
      .limit(50),
  );
  res.json({
    items: rows.map(({ profiles, ...a }) => ({ ...a, nickname: profiles?.nickname ?? '알 수 없음', avatar: profiles?.avatar ?? {} })),
  });
});

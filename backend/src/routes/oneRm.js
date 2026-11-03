import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { oneRmSchema, uuid } from '../schemas.js';

export const oneRmRouter = Router();

// 내 기록 이력 + 종목별 박스 순위(사람별 최고 기록 기준 상위 10명)
oneRmRouter.get('/', async (req, res) => {
  const [mine, best] = await Promise.all([
    req.sb
      .from('one_rm_records')
      .select('id, movement, is_custom, weight_kg, achieved_on, created_at')
      .eq('user_id', req.userId)
      .order('achieved_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300),
    req.sb.from('one_rm_best').select('user_id, movement, is_custom, weight_kg, achieved_on, nickname').limit(2000),
  ]);

  const rankings = {};
  for (const row of unwrap(best)) {
    const key = row.is_custom ? `custom:${row.movement}` : row.movement;
    (rankings[key] ??= []).push({ ...row, weight_kg: Number(row.weight_kg) });
  }
  for (const key of Object.keys(rankings)) {
    rankings[key] = rankings[key].sort((a, b) => b.weight_kg - a.weight_kg).slice(0, 10);
  }

  res.json({
    records: unwrap(mine).map((r) => ({ ...r, weight_kg: Number(r.weight_kg) })),
    rankings,
  });
});

oneRmRouter.post('/', async (req, res) => {
  const body = oneRmSchema.parse(req.body);
  const record = unwrap(
    await req.sb.from('one_rm_records').insert(body).select('id, movement, is_custom, weight_kg, achieved_on').single(),
  );
  // 트리거가 PR이면 명예의 벽에 기록했는지 확인해서 알려준다
  const { data: pr } = await req.sb
    .from('activities')
    .select('id, payload')
    .eq('user_id', req.userId)
    .eq('kind', 'pr')
    .gte('created_at', new Date(Date.now() - 10_000).toISOString())
    .contains('payload', { movement: record.movement })
    .limit(1)
    .maybeSingle();
  res.status(201).json({ record: { ...record, weight_kg: Number(record.weight_kg) }, isPr: Boolean(pr) });
});

oneRmRouter.delete('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('one_rm_records').delete().eq('id', id).eq('user_id', req.userId).select('id'));
  if (!deleted.length) throw new HttpError(404, '기록을 찾을 수 없습니다');
  res.status(204).end();
});

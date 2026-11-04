import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { oneRmSchema, uuid } from '../schemas.js';

export const oneRmRouter = Router();

// DB의 numeric은 문자열로 오므로 숫자로 바꾼다
const clean = (r) => ({ ...r, weight_lb: r.weight_lb == null ? null : Number(r.weight_lb), time_sec: r.time_sec ?? null });

// 내 기록 이력 + 종목별 박스 순위(사람별 최고 기록 기준 상위 10명)
oneRmRouter.get('/', async (req, res) => {
  const [mine, best] = await Promise.all([
    req.sb
      .from('one_rm_records')
      .select('id, movement, is_custom, unit, weight_lb, time_sec, achieved_on, created_at')
      .eq('user_id', req.userId)
      .order('achieved_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300),
    req.sb.from('one_rm_best').select('user_id, movement, is_custom, unit, weight_lb, time_sec, achieved_on, nickname, gender').limit(2000),
  ]);

  // 순위: 무게는 무거운 순, 시간은 빠른 순
  const rankings = {};
  for (const row of unwrap(best)) {
    const key = `${row.unit === 'time' ? 'time' : 'lb'}:${row.is_custom ? 'custom:' : ''}${row.movement}`;
    (rankings[key] ??= []).push(clean(row));
  }
  // 종목마다 전체 / 남자 / 여자 상위 10명
  for (const key of Object.keys(rankings)) {
    const time = key.startsWith('time:');
    const sorted = rankings[key].sort((a, b) => (time ? a.time_sec - b.time_sec : b.weight_lb - a.weight_lb));
    rankings[key] = {
      all: sorted.slice(0, 10),
      M: sorted.filter((r) => r.gender === 'M').slice(0, 10),
      F: sorted.filter((r) => r.gender === 'F').slice(0, 10),
    };
  }

  res.json({
    records: unwrap(mine).map(clean),
    rankings,
  });
});

oneRmRouter.post('/', async (req, res) => {
  const body = oneRmSchema.parse(req.body);
  const record = unwrap(
    await req.sb.from('one_rm_records').insert(body).select('id, movement, is_custom, unit, weight_lb, time_sec, achieved_on').single(),
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
  res.status(201).json({ record: clean(record), isPr: Boolean(pr) });
});

oneRmRouter.delete('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('one_rm_records').delete().eq('id', id).eq('user_id', req.userId).select('id'));
  if (!deleted.length) throw new HttpError(404, '기록을 찾을 수 없습니다');
  res.status(204).end();
});

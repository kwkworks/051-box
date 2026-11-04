import { Router } from 'express';
import { requireMember } from '../auth.js';
import { HttpError, fromDbError, unwrap } from '../errors.js';
import { meUpdateSchema } from '../schemas.js';

export const meRouter = Router();

// 내 정보 + 출석 스트릭 + 종목별 최고 1RM (WOD 무게 자동 계산용)
meRouter.get('/', async (req, res) => {
  const { profile, sb, userId } = req;
  const base = { profile };
  if (!['member', 'admin'].includes(profile.role)) {
    return res.json({ ...base, streak: 0, checkedInToday: false, bestLifts: {} });
  }

  const [streak, today, best] = await Promise.all([
    sb.rpc('my_streak'),
    sb.rpc('kst_today'),
    sb.from('one_rm_best').select('movement, weight_kg').eq('user_id', userId).eq('is_custom', false),
  ]);
  const todayDate = unwrap(today);
  const { data: attended, error } = await sb
    .from('attendance')
    .select('attend_date')
    .eq('user_id', userId)
    .eq('attend_date', todayDate)
    .maybeSingle();
  if (error) throw fromDbError(error);

  res.json({
    ...base,
    streak: unwrap(streak),
    today: todayDate,
    checkedInToday: Boolean(attended),
    bestLifts: Object.fromEntries(unwrap(best).map((r) => [r.movement, Number(r.weight_kg)])),
  });
});

// 닉네임, 캐릭터 저장 (승인 대기 중에도 가능)
meRouter.patch('/', async (req, res) => {
  const body = meUpdateSchema.parse(req.body);
  const result = await req.sb.from('profiles').update(body).eq('id', req.userId).select('id, nickname, role, avatar').single();
  if (result.error?.code === '23505') throw new HttpError(409, '이미 다른 회원이 쓰는 닉네임이에요');
  const profile = unwrap(result);
  res.json({ profile });
});

// 오늘 출석 체크. 날짜는 DB가 한국 시간 기준으로 정한다(클라이언트 값 사용 안 함).
meRouter.post('/attendance', requireMember, async (req, res) => {
  const { error } = await req.sb.from('attendance').insert({});
  if (error && error.code !== '23505') throw fromDbError(error);
  const streak = unwrap(await req.sb.rpc('my_streak'));
  res.status(error ? 200 : 201).json({ checkedInToday: true, alreadyChecked: Boolean(error), streak });
});

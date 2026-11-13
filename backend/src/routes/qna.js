import { Router } from 'express';
import { HttpError, unwrap } from '../errors.js';
import { qnaAnswerSchema, qnaQuestionSchema, uuid } from '../schemas.js';

export const qnaRouter = Router();

const COLUMNS = 'id, user_id, title, body, answer, answered_at, created_at';

// 목록: 회원은 내 문의만, 관리자는 전체 (DB RLS가 같은 규칙을 강제)
qnaRouter.get('/', async (req, res) => {
  const rows = unwrap(
    await req.sb
      .from('qna_questions')
      .select(`${COLUMNS}, author:profiles!user_id(nickname)`)
      .order('created_at', { ascending: false })
      .limit(200),
  );
  res.json({
    questions: rows.map(({ author, ...q }) => ({ ...q, nickname: author?.nickname ?? '알 수 없음', mine: q.user_id === req.userId })),
  });
});

// 문의 작성 (승인된 회원, 하루 10개까지는 DB가 막는다)
qnaRouter.post('/', async (req, res) => {
  const body = qnaQuestionSchema.parse(req.body);
  const question = unwrap(await req.sb.from('qna_questions').insert(body).select(COLUMNS).single());
  res.status(201).json({ question });
});

// 삭제: 쓴 사람 또는 관리자
qnaRouter.delete('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = unwrap(await req.sb.from('qna_questions').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new HttpError(403, '삭제할 권한이 없거나 이미 삭제된 문의예요');
  res.status(204).end();
});

// 답변 달기·고치기·지우기: 관리자만 (answer: null이면 답변 지우기)
qnaRouter.put('/:id/answer', async (req, res) => {
  if (req.profile.role !== 'admin') throw new HttpError(403, '관리자만 답변할 수 있어요');
  const id = uuid.parse(req.params.id);
  const { answer } = qnaAnswerSchema.parse(req.body);
  const updated = unwrap(await req.sb.from('qna_questions').update({ answer }).eq('id', id).select(COLUMNS));
  if (!updated.length) throw new HttpError(404, '문의를 찾을 수 없어요');
  res.json({ question: updated[0] });
});

import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// DB가 raise exception으로 거부한 사용자용 메시지 (정원 초과, 마감 등)는 그대로 보여준다.
const SAFE_DB_MESSAGES = new Set([
  '신청이 마감되었습니다',
  '정원이 가득 찼습니다',
  '이벤트를 찾을 수 없습니다',
  '자신의 권한은 변경할 수 없습니다',
  '변경할 수 없는 항목입니다',
  '메시지를 너무 빨리 보내고 있어요',
  '관리자가 채팅을 잠갔어요',
  '채팅이 제한되어 있어요',
]);

// Supabase(PostgREST) 에러를 HTTP 응답으로 바꾼다. 내부 정보는 노출하지 않는다.
export function fromDbError(error) {
  if (!error) return null;
  if (error.code === '42501') return new HttpError(403, '권한이 없습니다');
  if (error.code === '23505') return new HttpError(409, '이미 등록되어 있습니다');
  if (error.code === '23503') return new HttpError(400, '연결된 데이터를 찾을 수 없습니다');
  if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
    return new HttpError(400, '입력값이 올바르지 않습니다');
  }
  if (error.code === 'P0001' && SAFE_DB_MESSAGES.has(error.message)) {
    return new HttpError(400, error.message);
  }
  // 하루 등록 상한 (DB가 개수를 넣어서 보낸다: "오늘은 더 등록할 수 없어요 (하루 N개까지)")
  if (error.code === 'P0001' && /^오늘은 더 등록할 수 없어요 \(하루 \d+개까지\)$/.test(error.message)) {
    return new HttpError(429, error.message);
  }
  if (error.code === 'PGRST116') return new HttpError(404, '찾을 수 없습니다');
  console.error('[db]', error.code, error.message);
  return new HttpError(500, '요청을 처리하지 못했습니다');
}

// 결과의 error가 있으면 던지고, 없으면 data를 돌려준다.
export function unwrap({ data, error }) {
  if (error) throw fromDbError(error);
  return data;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: '입력값이 올바르지 않습니다', fields: err.issues.map((i) => i.path.join('.')) });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? '사진은 5MB 이하만 올릴 수 있습니다' : '파일 업로드에 실패했습니다';
    return res.status(400).json({ error: message });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: '요청이 너무 큽니다' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 형식이 올바르지 않습니다' });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: '서버 오류가 발생했습니다' });
}

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAdmin, requireAuth, requireMember } from './auth.js';
import { config } from './config.js';
import { HttpError, errorHandler } from './errors.js';
import { adminRouter } from './routes/admin.js';
import { chatRouter } from './routes/chat.js';
import { eventsRouter } from './routes/events.js';
import { feedRouter } from './routes/feed.js';
import { meRouter } from './routes/me.js';
import { noticesRouter } from './routes/notices.js';
import { oneRmRouter } from './routes/oneRm.js';
import { wodsRouter } from './routes/wods.js';
import { pushPublicRouter, pushRouter } from './routes/push.js';

export function createApp() {
  const app = express();

  // Render는 프록시 뒤에서 동작하므로 실제 접속 IP를 rate limit에 쓰려면 1단계 프록시를 신뢰한다.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      // 허용한 프론트 주소에서 온 요청만 받는다
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new HttpError(403, '허용되지 않은 출처입니다'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '50kb' }));

  // 핑(외부 모니터)과 "서버 깨우기"용. 인증 없이 상태만 알려준다.
  // version: Render가 넣어 주는 배포 커밋 앞 7자리 (새 코드가 배포됐는지 확인용, 비밀 아님)
  app.get('/health', (req, res) => res.json({ ok: true, version: (process.env.RENDER_GIT_COMMIT ?? 'dev').slice(0, 7) }));

  const tooMany = { error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요' };
  // 1) 로그인 전 IP 기준: 같은 박스 와이파이를 여러 회원이 함께 써도 막히지 않게 넉넉히 (무차별 요청만 차단)
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: tooMany,
    }),
  );
  // 2) 로그인 후 회원 계정 기준 (IP를 공유해도 서로 영향 없음)
  const perUser = (opts) =>
    rateLimit({
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: tooMany,
      keyGenerator: (req) => req.userId,
      ...opts,
    });
  const isPing = (req) => /^\/chat\/session\/[^/]+\/ping$/.test(req.path);
  const userLimiter = perUser({ windowMs: 15 * 60 * 1000, limit: 900 });
  // 접속 유지 신호(30초마다)는 쓰기 제한에서 뺀다
  const writeLimiter = perUser({ windowMs: 60 * 1000, limit: 60, skip: (req) => req.method === 'GET' || isPing(req) });

  // 매일 20:30 예약 작업이 부르는 WOD 공개 알림 (로그인 없음, 하루 한 번만 실제로 보냄)
  app.use('/push', pushPublicRouter);

  app.use(requireAuth, userLimiter, writeLimiter);
  app.use('/me', meRouter);
  app.use('/wods', requireMember, wodsRouter);
  app.use('/notices', requireMember, noticesRouter);
  app.use('/events', requireMember, eventsRouter);
  app.use('/one-rm', requireMember, oneRmRouter);
  app.use('/feed', requireMember, feedRouter);
  app.use('/chat', requireMember, chatRouter);
  app.use('/push', requireMember, pushRouter);
  app.use('/admin', requireAdmin, adminRouter);

  app.use((req, res) => res.status(404).json({ error: '없는 주소입니다' }));
  app.use(errorHandler);
  return app;
}

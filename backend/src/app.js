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
  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요' },
    }),
  );
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.method === 'GET',
    message: { error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요' },
  });

  app.use(requireAuth, writeLimiter);
  app.use('/me', meRouter);
  app.use('/wods', requireMember, wodsRouter);
  app.use('/notices', requireMember, noticesRouter);
  app.use('/events', requireMember, eventsRouter);
  app.use('/one-rm', requireMember, oneRmRouter);
  app.use('/feed', requireMember, feedRouter);
  app.use('/chat', requireMember, chatRouter);
  app.use('/admin', requireAdmin, adminRouter);

  app.use((req, res) => res.status(404).json({ error: '없는 주소입니다' }));
  app.use(errorHandler);
  return app;
}

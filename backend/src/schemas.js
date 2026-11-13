import { z } from 'zod';

// 프론트(frontend/src/lib/constants.ts)와 같은 목록을 유지한다.
export const MOVEMENTS = [
  'back_squat', 'front_squat', 'overhead_squat', 'deadlift', 'clean', 'power_clean',
  'clean_and_jerk', 'snatch', 'power_snatch', 'push_press', 'strict_press', 'bench_press', 'thruster',
];

// 네임드 WOD (시간 기록, 짧을수록 좋음). DB 제약(0007)과 프론트 목록과 같게 유지한다.
const NAMED_WODS = [
  'fran', 'grace', 'isabel', 'helen', 'diane', 'elizabeth', 'annie', 'jackie', 'karen',
  'nancy', 'kelly', 'amanda', 'murph', 'dt', 'jt',
];

const AVATAR_OPTIONS = {
  skin: ['s1', 's2', 's3', 's4', 's5', 's6'],
  eyes: ['round', 'smile', 'sharp', 'sleepy', 'sparkle'],
  brows: ['normal', 'thick', 'angry', 'none'],
  mouth: ['smile', 'grin', 'neutral', 'open'],
  facial: ['none', 'mustache', 'beard', 'stubble'],
  hair: ['short', 'buzz', 'long', 'ponytail', 'bun', 'curly', 'mohawk', 'sidepart', 'bob', 'twintail', 'bald'],
  hairColor: ['black', 'brown', 'blonde', 'red', 'gray', 'blue', 'pink', 'green', 'white', 'purple'],
  top: ['tshirt', 'tank', 'hoodie', 'crop', 'longsleeve', 'jersey'],
  topColor: ['burgundy', 'yellow', 'black', 'white', 'blue', 'green', 'red', 'purple', 'gray', 'orange', 'navy', 'pink'],
  topPrint: ['none', 'stripe', 'logo'],
  bottom: ['shorts', 'pants', 'leggings', 'joggers'],
  bottomColor: ['black', 'gray', 'navy', 'burgundy', 'khaki', 'white', 'blue', 'green', 'pink'],
  shoes: ['black', 'white', 'red', 'blue', 'yellow', 'green', 'pink'],
  head: ['none', 'headband', 'cap', 'beanie', 'backcap'],
  face: ['none', 'glasses', 'sunglasses'],
  gear: ['none', 'wristwraps', 'kneesleeves', 'belt', 'headphones'],
};

// 허용 목록에 있는 값만 저장한다 (임의 JSON 저장 차단)
const avatarSchema = z.strictObject(
  Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([key, values]) => [key, z.enum(values)])),
);

const text = (max) => z.string().trim().max(max);
const requiredText = (max) => z.string().trim().min(1).max(max);

// 닉네임: 한글, 영문, 숫자, 공백, _ . - 만 허용 (DB 트리거와 같은 규칙)
export const nickname = z.string().trim().min(2).max(16).regex(/^[0-9A-Za-z가-힣 _.-]+$/);

export const isoDate = z.iso.date();
export const uuid = z.uuid();

export const meUpdateSchema = z
  .strictObject({
    nickname: nickname.optional(),
    avatar: avatarSchema.optional(),
    gender: z.enum(['M', 'F']).nullable().optional(), // 박스 순위 남/여 구분 (선택 안 함 = null)
    // 푸시 알림 종류별 켜기/끄기
    notify_prefs: z
      .strictObject({
        wod: z.boolean(),
        notices: z.boolean(),
        competition: z.boolean(),
        gathering: z.boolean(),
        signup: z.boolean().optional(), // 관리자: 가입 요청 알림
        cheer: z.boolean().optional(), // 내 PR 축하 알림
      })
      .optional(),
  })
  .refine(
    (v) => v.nickname !== undefined || v.avatar !== undefined || v.gender !== undefined || v.notify_prefs !== undefined,
    '변경할 내용이 없습니다',
  );

// Q&A 문의 / 답변
export const qnaQuestionSchema = z.strictObject({ title: requiredText(80), body: requiredText(2000) });
export const qnaAnswerSchema = z.strictObject({ answer: requiredText(2000).nullable() });

const percentValue = z.number().int().min(30).max(120);

export const wodSchema = z.strictObject({
  title: requiredText(80),
  content: text(4000).default(''),
  lifts: z
    .array(
      z.strictObject({
        movement: z.enum(MOVEMENTS),
        // 단일 값(70) 또는 범위([60, 65], 작은 수 → 큰 수)
        percents: z
          .array(
            z.union([
              percentValue,
              z.tuple([percentValue, percentValue]).refine(([a, b]) => a < b, '범위는 작은 수부터 적어주세요'),
            ]),
          )
          .min(1)
          .max(10),
      }),
    )
    .max(10)
    .default([]),
});

const noticeSchema = z.strictObject({
  title: requiredText(100),
  body: text(5000).default(''),
  pinned: z.boolean().default(false),
  // A. 카페에서 가져온 글이면 카페 원문 주소 (서버가 우리 카페 주소 모양으로 바꿔서 저장)
  cafe_url: z.string().trim().max(1000).nullable().optional(),
});
export const noticeUpdateSchema = noticeSchema.partial();
// B. 새 공지를 카페에도 올리기: 공지사항 / 대회 정보 공유 게시판
export const noticeCreateSchema = noticeSchema.extend({
  post_to_cafe: z.enum(['notice', 'competition']).nullable().optional(),
});

const httpsUrl = z
  .url({ protocol: /^https$/ })
  .max(500);

const eventFields = {
    title: requiredText(80),
    description: text(3000).default(''),
    starts_at: z.iso.datetime({ offset: true }),
    location: text(100).default(''),
    link_url: httpsUrl.nullable().default(null),
    signup_deadline: z.iso.datetime({ offset: true }).nullable().default(null),
    capacity: z.number().int().min(1).max(500).nullable().default(null),
};
const deadlineBeforeStart = [
  (v) => !v.signup_deadline || new Date(v.signup_deadline) <= new Date(v.starts_at),
  { message: '신청 마감은 시작 시간보다 앞이어야 해요', path: ['signup_deadline'] },
];
export const eventSchema = z
  .strictObject({ kind: z.enum(['competition', 'event', 'gathering']), ...eventFields })
  .refine(...deadlineBeforeStart);
// 수정: 종류(대회/이벤트/모임)는 바꿀 수 없고 나머지 내용만 고친다
export const eventUpdateSchema = z.strictObject(eventFields).refine(...deadlineBeforeStart);

export const oneRmSchema = z
  .strictObject({
    movement: z.string().trim().min(1).max(30),
    is_custom: z.boolean(),
    unit: z.enum(['lb', 'time']).default('lb'),
    weight_lb: z.number().positive().max(1200).multipleOf(0.5).optional(), // 파운드
    time_sec: z.number().int().min(1).max(86400).optional(), // 초
    achieved_on: isoDate.optional(),
  })
  .refine((v) => (v.unit === 'lb' ? v.weight_lb !== undefined && v.time_sec === undefined : v.time_sec !== undefined && v.weight_lb === undefined), {
    message: '기록 값을 다시 입력해주세요',
    path: ['unit'],
  })
  .refine((v) => v.is_custom || (v.unit === 'lb' ? MOVEMENTS : NAMED_WODS).includes(v.movement), {
    message: '종목을 다시 선택해주세요',
    path: ['movement'],
  })
  .refine((v) => !v.is_custom || /^[0-9A-Za-z가-힣 ()_.-]+$/.test(v.movement), { message: '종목 이름에 쓸 수 없는 문자가 있어요', path: ['movement'] });

export const roleSchema = z.strictObject({ role: z.enum(['pending', 'member', 'admin', 'rejected']) });

export const chatSchema = z.strictObject({
  body: z.string().trim().min(1).max(200).regex(/^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/),
});

export const sheetUrlSchema = z.strictObject({ url: z.url({ protocol: /^https$/ }).max(500) });

export const chatReadSchema = z.strictObject({ at: z.iso.datetime({ offset: true }) });
// 푸시 알림 구독 (브라우저가 만든 값)
export const pushSubscribeSchema = z.strictObject({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+=*$/),
    auth: z.string().min(10).max(100).regex(/^[A-Za-z0-9_-]+=*$/),
  }),
});
export const pushUnsubscribeSchema = z.strictObject({ endpoint: z.url({ protocol: /^https$/ }).max(1000) });

export const photoOrderSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(30) });

export const chatMuteSchema = z.strictObject({ mute: z.enum(['1h', 'today', 'off']) });
export const chatLockSchema = z.strictObject({ locked: z.boolean() });

export const holidaySchema = z.strictObject({ day: isoDate, name: requiredText(30) });

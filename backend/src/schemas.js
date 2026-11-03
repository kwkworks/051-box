import { z } from 'zod';

// 프론트(frontend/src/lib/constants.ts)와 같은 목록을 유지한다.
export const MOVEMENTS = [
  'back_squat', 'front_squat', 'overhead_squat', 'deadlift', 'clean', 'power_clean',
  'clean_and_jerk', 'snatch', 'power_snatch', 'push_press', 'strict_press', 'bench_press', 'thruster',
];

export const AVATAR_OPTIONS = {
  skin: ['s1', 's2', 's3', 's4', 's5'],
  hair: ['short', 'buzz', 'long', 'ponytail', 'bun', 'curly'],
  hairColor: ['black', 'brown', 'blonde', 'red', 'gray', 'blue', 'pink', 'green'],
  top: ['tshirt', 'tank', 'hoodie'],
  topColor: ['burgundy', 'yellow', 'black', 'white', 'blue', 'green', 'red', 'purple', 'gray', 'orange'],
  bottom: ['shorts', 'pants'],
  bottomColor: ['black', 'gray', 'navy', 'burgundy', 'khaki', 'white', 'blue', 'green'],
  shoes: ['black', 'white', 'red', 'blue', 'yellow', 'green'],
  acc: ['none', 'headband', 'cap', 'glasses', 'wristband'],
};

// 허용 목록에 있는 값만 저장한다 (임의 JSON 저장 차단)
export const avatarSchema = z.strictObject(
  Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([key, values]) => [key, z.enum(values)])),
);

const text = (max) => z.string().trim().max(max);
const requiredText = (max) => z.string().trim().min(1).max(max);

// 닉네임: 한글, 영문, 숫자, 공백, _ . - 만 허용 (DB 트리거와 같은 규칙)
export const nickname = z.string().trim().min(2).max(16).regex(/^[0-9A-Za-z가-힣 _.-]+$/);

export const isoDate = z.iso.date();
export const uuid = z.uuid();

export const meUpdateSchema = z
  .strictObject({ nickname: nickname.optional(), avatar: avatarSchema.optional() })
  .refine((v) => v.nickname !== undefined || v.avatar !== undefined, '변경할 내용이 없습니다');

export const wodSchema = z.strictObject({
  title: requiredText(80),
  content: text(4000).default(''),
  lifts: z
    .array(
      z.strictObject({
        movement: z.enum(MOVEMENTS),
        percents: z.array(z.number().int().min(30).max(120)).min(1).max(10),
      }),
    )
    .max(10)
    .default([]),
});

export const noticeSchema = z.strictObject({
  title: requiredText(100),
  body: text(5000).default(''),
  pinned: z.boolean().default(false),
});
export const noticeUpdateSchema = noticeSchema.partial();

const httpsUrl = z
  .url({ protocol: /^https$/ })
  .max(500);

export const eventSchema = z
  .strictObject({
    kind: z.enum(['competition', 'event', 'gathering']),
    title: requiredText(80),
    description: text(3000).default(''),
    starts_at: z.iso.datetime({ offset: true }),
    location: text(100).default(''),
    link_url: httpsUrl.nullable().default(null),
    signup_deadline: z.iso.datetime({ offset: true }).nullable().default(null),
    capacity: z.number().int().min(1).max(500).nullable().default(null),
  })
  .refine((v) => !v.signup_deadline || new Date(v.signup_deadline) <= new Date(v.starts_at), {
    message: '신청 마감은 시작 시간보다 앞이어야 해요',
    path: ['signup_deadline'],
  });

export const oneRmSchema = z
  .strictObject({
    movement: z.string().trim().min(1).max(30),
    is_custom: z.boolean(),
    weight_kg: z.number().positive().max(500).multipleOf(0.5),
    achieved_on: isoDate.optional(),
  })
  .refine((v) => v.is_custom || MOVEMENTS.includes(v.movement), { message: '종목을 다시 선택해주세요', path: ['movement'] })
  .refine((v) => !v.is_custom || /^[0-9A-Za-z가-힣 ()_.-]+$/.test(v.movement), { message: '종목 이름에 쓸 수 없는 문자가 있어요', path: ['movement'] });

export const roleSchema = z.strictObject({ role: z.enum(['pending', 'member', 'admin']) });

export const holidaySchema = z.strictObject({ day: isoDate, name: requiredText(30) });

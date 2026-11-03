// 백엔드(backend/src/schemas.js)와 같은 목록을 유지한다.
export const MOVEMENTS = {
  back_squat: '백스쿼트',
  front_squat: '프론트스쿼트',
  overhead_squat: '오버헤드스쿼트',
  deadlift: '데드리프트',
  clean: '클린',
  power_clean: '파워클린',
  clean_and_jerk: '클린앤저크',
  snatch: '스내치',
  power_snatch: '파워스내치',
  push_press: '푸시프레스',
  strict_press: '스트릭트프레스',
  bench_press: '벤치프레스',
  thruster: '쓰러스터',
} as const;

export type MovementKey = keyof typeof MOVEMENTS;

export function movementLabel(movement: string, isCustom = false) {
  if (isCustom) return movement;
  return MOVEMENTS[movement as MovementKey] ?? movement;
}

export const EVENT_KINDS = {
  competition: '대회',
  event: '이벤트',
  gathering: '모임',
} as const;

// 캐릭터 파츠. 값은 백엔드 허용 목록과 같아야 저장된다.
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
} as const;

export type Avatar = { [K in keyof typeof AVATAR_OPTIONS]: (typeof AVATAR_OPTIONS)[K][number] };

export const DEFAULT_AVATAR: Avatar = {
  skin: 's2',
  hair: 'short',
  hairColor: 'black',
  top: 'tshirt',
  topColor: 'burgundy',
  bottom: 'shorts',
  bottomColor: 'black',
  shoes: 'white',
  acc: 'none',
};

export const AVATAR_LABELS: Record<keyof Avatar, string> = {
  skin: '피부',
  hair: '머리 모양',
  hairColor: '머리 색',
  top: '상의',
  topColor: '상의 색',
  bottom: '하의',
  bottomColor: '하의 색',
  shoes: '신발',
  acc: '액세서리',
};

export const OPTION_LABELS: Record<string, string> = {
  short: '숏컷', buzz: '버즈컷', long: '장발', ponytail: '포니테일', bun: '똥머리', curly: '곱슬',
  tshirt: '티셔츠', tank: '나시', hoodie: '후드',
  shorts: '반바지', pants: '긴바지',
  none: '없음', headband: '헤드밴드', cap: '모자', glasses: '안경', wristband: '손목밴드',
};

// 실제 색상값 (캐릭터 그리기와 색상 선택 버튼에 사용)
export const COLORS = {
  skin: { s1: '#FCE3CF', s2: '#F2C9A0', s3: '#D9A273', s4: '#A9714A', s5: '#6E4630' },
  hair: {
    black: '#22201E', brown: '#5A3A24', blonde: '#E0B85A', red: '#B0442C',
    gray: '#9A9893', blue: '#3B6FD1', pink: '#E58FB5', green: '#3E9E5F',
  },
  cloth: {
    burgundy: '#7A2E3A', yellow: '#E8B923', black: '#1F1F22', white: '#F4F2EE', blue: '#3B82C4',
    green: '#3E9E5F', red: '#D9443E', purple: '#7A5BC7', gray: '#8C8B88', orange: '#E8792B',
    navy: '#25345C', khaki: '#A7966A',
  },
} as const;

export function normalizeAvatar(a?: Partial<Avatar> | null): Avatar {
  const out = { ...DEFAULT_AVATAR };
  if (!a) return out;
  for (const key of Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[]) {
    const value = a[key];
    if (value && (AVATAR_OPTIONS[key] as readonly string[]).includes(value)) {
      (out as Record<string, string>)[key] = value;
    }
  }
  return out;
}

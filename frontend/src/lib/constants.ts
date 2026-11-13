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

// 네임드 WOD (시간 기록, 짧을수록 좋음). 백엔드·DB 목록과 같게 유지한다.
export const NAMED_WODS = {
  fran: 'Fran',
  grace: 'Grace',
  isabel: 'Isabel',
  helen: 'Helen',
  diane: 'Diane',
  elizabeth: 'Elizabeth',
  annie: 'Annie',
  jackie: 'Jackie',
  karen: 'Karen',
  nancy: 'Nancy',
  kelly: 'Kelly',
  amanda: 'Amanda',
  murph: 'Murph (Hero)',
  dt: 'DT (Hero)',
  jt: 'JT (Hero)',
} as const;

export type NamedWodKey = keyof typeof NAMED_WODS;

// 선택 목록 순서: 리프트는 가나다순, 네임드 WOD는 ABC순
export const MOVEMENT_KEYS_SORTED = (Object.keys(MOVEMENTS) as MovementKey[]).sort((a, b) =>
  MOVEMENTS[a].localeCompare(MOVEMENTS[b], 'ko'),
);
export const NAMED_WOD_KEYS_SORTED = (Object.keys(NAMED_WODS) as NamedWodKey[]).sort((a, b) =>
  NAMED_WODS[a].localeCompare(NAMED_WODS[b], 'en', { sensitivity: 'base' }),
);

// 1RM 검색용 다른 이름: 네임드 WOD는 한글로, 리프트는 영어로도 찾을 수 있게
const SEARCH_ALIASES: Record<string, string[]> = {
  fran: ['프란'],
  grace: ['그레이스'],
  isabel: ['이사벨', '이자벨'],
  helen: ['헬렌'],
  diane: ['다이앤', '다이안'],
  elizabeth: ['엘리자베스'],
  annie: ['애니'],
  jackie: ['재키', '잭키'],
  karen: ['캐런', '카렌'],
  nancy: ['낸시'],
  kelly: ['켈리'],
  amanda: ['아만다'],
  murph: ['머프'],
  dt: ['디티'],
  jt: ['제이티'],
  back_squat: ['back squat', '백 스쿼트'],
  front_squat: ['front squat'],
  overhead_squat: ['overhead squat', 'ohs'],
  deadlift: ['deadlift', 'dl'],
  clean: ['clean', '스쿼트클린', 'squat clean'],
  power_clean: ['power clean'],
  clean_and_jerk: ['clean and jerk', 'clean & jerk', '클린앤드저크', '용상'],
  snatch: ['snatch', '스쿼트스내치', 'squat snatch', '인상'],
  power_snatch: ['power snatch'],
  push_press: ['push press', '푸쉬프레스'],
  strict_press: ['strict press', 'shoulder press', '숄더프레스'],
  bench_press: ['bench press'],
  thruster: ['thruster', '스러스터', '쓰러스터'],
};

// 검색어가 이 종목에 맞는지 (대소문자·띄어쓰기 무시, 화면 이름·내부 이름·다른 이름 모두)
export function matchesSearch(query: string, key: string, label: string, isCustom = false): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[\s_]+/g, '');
  const q = norm(query);
  if (!q) return true;
  const names = [label, key, ...(isCustom ? [] : (SEARCH_ALIASES[key] ?? []))];
  return names.some((n) => norm(n).includes(q));
}

export function movementLabel(movement: string, isCustom = false) {
  if (isCustom) return movement;
  return MOVEMENTS[movement as MovementKey] ?? NAMED_WODS[movement as NamedWodKey] ?? movement;
}

export const EVENT_KINDS = {
  competition: '대회',
  event: '이벤트',
  gathering: '모임',
} as const;

// 캐릭터 파츠. 값은 백엔드(backend/src/schemas.js) 허용 목록과 같아야 저장된다.
export const AVATAR_OPTIONS = {
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
} as const;

export type Avatar = { [K in keyof typeof AVATAR_OPTIONS]: (typeof AVATAR_OPTIONS)[K][number] };

export const DEFAULT_AVATAR: Avatar = {
  skin: 's2',
  eyes: 'round',
  brows: 'normal',
  mouth: 'smile',
  facial: 'none',
  hair: 'short',
  hairColor: 'black',
  top: 'tshirt',
  topColor: 'burgundy',
  topPrint: 'none',
  bottom: 'shorts',
  bottomColor: 'black',
  shoes: 'white',
  head: 'none',
  face: 'none',
  gear: 'none',
};

// 꾸미기 화면의 묶음(탭)
export const AVATAR_GROUPS: { title: string; keys: (keyof Avatar)[] }[] = [
  { title: '얼굴', keys: ['skin', 'eyes', 'brows', 'mouth', 'facial'] },
  { title: '헤어', keys: ['hair', 'hairColor'] },
  { title: '옷', keys: ['top', 'topColor', 'topPrint', 'bottom', 'bottomColor', 'shoes'] },
  { title: '장비·소품', keys: ['head', 'face', 'gear'] },
];

export const AVATAR_LABELS: Record<keyof Avatar, string> = {
  skin: '피부',
  eyes: '눈',
  brows: '눈썹',
  mouth: '입',
  facial: '수염',
  hair: '머리 모양',
  hairColor: '머리 색',
  top: '상의',
  topColor: '상의 색',
  topPrint: '상의 무늬',
  bottom: '하의',
  bottomColor: '하의 색',
  shoes: '신발',
  head: '모자·밴드',
  face: '안경',
  gear: '운동 장비',
};

export const OPTION_LABELS: Record<string, string> = {
  round: '동글', smile: '웃음', sharp: '날카로움', sleepy: '졸림', sparkle: '반짝',
  normal: '기본', thick: '진한', angry: '화남',
  grin: '활짝', neutral: '무표정', open: '놀람',
  mustache: '콧수염', beard: '턱수염', stubble: '거뭇',
  short: '숏컷', buzz: '버즈컷', long: '장발', ponytail: '포니테일', bun: '똥머리', curly: '곱슬',
  mohawk: '모히칸', sidepart: '가르마', bob: '단발', twintail: '양갈래', bald: '민머리',
  tshirt: '티셔츠', tank: '나시', hoodie: '후드', crop: '크롭', longsleeve: '긴팔', jersey: '저지',
  stripe: '줄무늬', logo: '051 로고',
  shorts: '반바지', pants: '긴바지', leggings: '레깅스', joggers: '조거',
  none: '없음', headband: '헤드밴드', cap: '모자', beanie: '비니', backcap: '뒤로 쓴 모자',
  glasses: '안경', sunglasses: '선글라스',
  wristwraps: '손목 랩', kneesleeves: '무릎 슬리브', belt: '리프팅 벨트', headphones: '헤드폰',
};

// 실제 색상값 (캐릭터 그리기와 색상 선택 버튼에 사용)
export const COLORS = {
  skin: { s1: '#FCE3CF', s2: '#F2C9A0', s3: '#D9A273', s4: '#A9714A', s5: '#6E4630', s6: '#F7D7C4' },
  hair: {
    black: '#22201E', brown: '#5A3A24', blonde: '#E0B85A', red: '#B0442C', gray: '#9A9893',
    blue: '#3B6FD1', pink: '#E58FB5', green: '#3E9E5F', white: '#ECEAE4', purple: '#7A5BC7',
  },
  cloth: {
    burgundy: '#7A2E3A', yellow: '#E8B923', black: '#1F1F22', white: '#F4F2EE', blue: '#3B82C4',
    green: '#3E9E5F', red: '#D9443E', purple: '#7A5BC7', gray: '#8C8B88', orange: '#E8792B',
    navy: '#25345C', khaki: '#A7966A', pink: '#E58FB5',
  },
} as const;

// 이전 버전 캐릭터(acc 하나)를 새 파츠로 옮긴다
const LEGACY_ACC: Record<string, Partial<Avatar>> = {
  headband: { head: 'headband' },
  cap: { head: 'cap' },
  glasses: { face: 'glasses' },
  wristband: { gear: 'wristwraps' },
};

export function normalizeAvatar(a?: (Partial<Avatar> & { acc?: string }) | null): Avatar {
  const out = { ...DEFAULT_AVATAR };
  if (!a) return out;
  const src: Record<string, unknown> = { ...(a.acc ? LEGACY_ACC[a.acc] : {}), ...a };
  for (const key of Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[]) {
    const value = src[key];
    if (typeof value === 'string' && (AVATAR_OPTIONS[key] as readonly string[]).includes(value)) {
      (out as Record<string, string>)[key] = value;
    }
  }
  return out;
}

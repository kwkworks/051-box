import type { Avatar } from './constants';

export type Role = 'pending' | 'member' | 'admin' | 'rejected';

export type Profile = {
  id: string;
  nickname: string;
  role: Role;
  avatar: Partial<Avatar>;
  created_at?: string;
  chat_muted_until?: string | null;
  gender?: Gender | null; // 박스 순위 남/여 구분 (선택 안 함 = null)
  notify_prefs?: Partial<NotifyPrefs>;
};

// 푸시 알림 종류별 켜기/끄기
export type NotifyPrefs = { wod: boolean; notices: boolean; competition: boolean; gathering: boolean; signup: boolean };

export type Gender = 'M' | 'F';

export type Me = {
  profile: Profile;
  streak: number;
  today?: string;
  checkedInToday: boolean;
  bestLifts: Record<string, number>;
};

// 퍼센트: 단일 값(70) 또는 범위([60, 65])
export type Percent = number | [number, number];
export type Lift = { movement: string; percents: Percent[] };

export type Wod = {
  id: string;
  wod_date: string;
  title: string;
  content: string;
  lifts: Lift[];
  updated_at: string;
};

export type WodPhoto = { id: string; url: string | null; created_at: string };

export type Notice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type EventKind = 'competition' | 'event' | 'gathering';

export type BoxEvent = {
  id: string;
  kind: EventKind;
  title: string;
  description: string;
  starts_at: string;
  location: string;
  link_url: string | null;
  signup_deadline: string | null;
  capacity: number | null;
  closed_at: string | null; // 만든 사람·관리자가 마감한 시각 (null이면 열림)
  created_by: string;
  created_at: string;
  participant_count?: number;
  joined: boolean;
};

export type EventDetail = BoxEvent & {
  creator?: { nickname: string } | null;
  participants: { user_id: string; nickname: string; avatar: Partial<Avatar>; created_at: string }[];
  can_manage: boolean;
};

export type RecordUnit = 'lb' | 'time';

export type OneRmRecord = {
  id: string;
  movement: string;
  is_custom: boolean;
  unit: RecordUnit;
  weight_lb: number | null; // 파운드
  time_sec: number | null; // 초 (네임드 WOD)
  achieved_on: string;
  created_at: string;
};

export type RankRow = {
  user_id: string;
  movement: string;
  is_custom: boolean;
  unit: RecordUnit;
  weight_lb: number | null;
  time_sec: number | null;
  achieved_on: string;
  nickname: string;
  gender: Gender | null;
  avatar?: Partial<Avatar>; // 1~3위만 (시상대 캐릭터)
};

export type FeedItem = {
  id: string;
  kind: 'pr';
  payload: {
    movement: string;
    is_custom: boolean;
    unit?: RecordUnit;
    weight_lb?: number;
    prev_lb?: number | null;
    time_sec?: number;
    prev_sec?: number | null;
  };
  created_at: string;
  user_id: string;
  nickname: string;
  avatar: Partial<Avatar>;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  nickname: string;
  role?: 'pending' | 'member' | 'admin';
};

export type ChatState = {
  messages: ChatMessage[];
  readAt: string | null; // 어디까지 읽었는지
  locked: boolean;
  mutedUntil: string | null;
};

// 종목마다 전체 / 남자 / 여자 상위 10명
export type RankGroups = { all: RankRow[]; M: RankRow[]; F: RankRow[] };

import type { Avatar } from './constants';

export type Role = 'pending' | 'member' | 'admin';

export type Profile = {
  id: string;
  nickname: string;
  role: Role;
  avatar: Partial<Avatar>;
  created_at?: string;
};

export type Me = {
  profile: Profile;
  streak: number;
  today?: string;
  checkedInToday: boolean;
  bestLifts: Record<string, number>;
};

export type Lift = { movement: string; percents: number[] };

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

export type OneRmRecord = {
  id: string;
  movement: string;
  is_custom: boolean;
  weight_kg: number;
  achieved_on: string;
  created_at: string;
};

export type RankRow = {
  user_id: string;
  movement: string;
  is_custom: boolean;
  weight_kg: number;
  achieved_on: string;
  nickname: string;
};

export type FeedItem = {
  id: string;
  kind: 'pr';
  payload: { movement: string; is_custom: boolean; weight_kg: number; prev_kg: number };
  created_at: string;
  user_id: string;
  nickname: string;
  avatar: Partial<Avatar>;
};

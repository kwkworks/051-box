'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { ActionPad } from '@/components/ActionPad';
import { BgmControl } from '@/components/BgmControl';
import { QuickMenu } from '@/components/QuickMenu';
import { AvatarView } from '@/components/AvatarView';
import { ChatPanel } from '@/components/ChatPanel';
import { EventComments } from '@/components/EventComments';
import { EventDetailView } from '@/components/EventDetailView';
import { EventForm } from '@/components/EventForm';
import { NaverCafeCard } from '@/components/NaverCafeCard';
import { NoticeEditor } from '@/components/NoticeEditor';
import { NotificationSettings } from '@/components/NotificationSettings';
import { PushHelp } from '@/components/PushHelp';
import { OneRmBoard } from '@/components/OneRmBoard';
import { QnaItem } from '@/components/QnaItem';
import { WallCard } from '@/components/WallCard';
import { WodView } from '@/components/WodView';
import { Podium } from '@/components/Podium';
import { BoxSpace, type BoxSpaceHandle } from '@/game/BoxSpace';
import { NoticePopup } from '@/components/NoticePopup';
import { AVATAR_OPTIONS, type Avatar } from '@/lib/constants';
import type { ChatMessage, FeedItem, Profile, Wod } from '@/lib/types';

const DEMO: Profile = {
  id: '00000000-0000-0000-0000-000000000000',
  nickname: '미리보기',
  role: 'member',
  avatar: { hair: 'ponytail', hairColor: 'brown', topColor: 'yellow', head: 'headband', gear: 'wristwraps' },
};

// 모든 파츠가 한 번씩 나오도록 고르게 섞은 샘플
function samples(): Partial<Avatar>[] {
  const keys = Object.keys(AVATAR_OPTIONS) as (keyof Avatar)[];
  return Array.from({ length: 12 }, (_, i) =>
    Object.fromEntries(keys.map((k, j) => [k, AVATAR_OPTIONS[k][(i * 7 + j * 3) % AVATAR_OPTIONS[k].length]])),
  );
}

export function DevPreview() {
  const [opened, setOpened] = useState("");
  // 새 공지 미리보기: 벽 게시판 + 팝업 (가짜 공지)
  const demoNotice = { id: 'demo-notice', title: '11월 넷째 주 박스 운영 시간 변경 안내 (추수감사절 이벤트 WOD 포함)', body: '이번 주 토요일은 오전 10시 단체 WOD 한 타임만 운영합니다. 일요일은 정상 휴무이고, 다음 주 월요일부터는 평소 시간표로 돌아갑니다. 이벤트 WOD는 파트너 와드로 진행되니 짝꿍과 함께 오세요!', pinned: false, cafe_url: null, created_at: '2026-11-16T09:00:00Z', updated_at: '2026-11-16T09:00:00Z' };
  const [demoPopup, setDemoPopup] = useState(true);
  const [demoNew, setDemoNew] = useState(true);
  const [view, setView] = useState<'space' | 'avatars' | 'podium' | 'forms' | 'wod' | 'event' | 'wall' | 'qna' | 'onerm'>('space');
  const space = useRef<BoxSpaceHandle | null>(null);
  // 채팅 미리보기: 다른 회원 메시지 8개, 그중 5개는 이미 읽음
  const [msgs, setMsgs] = useState<ChatMessage[]>(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `demo-${i}`, user_id: '11111111-1111-1111-1111-111111111111', nickname: '코치', body: `미리보기 메시지 ${i + 1}`,
      created_at: new Date(Date.UTC(2026, 10, 4, 1, i)).toISOString(), role: i === 0 ? 'admin' : 'member',
    })),
  );
  const demoMarker = new Date(Date.UTC(2026, 10, 4, 1, 4)).toISOString();
  const [demoRead, setDemoRead] = useState<string | null>(demoMarker);
  // 실제 박스 화면처럼 브라우저에서만 채팅창을 그린다 (저장된 위치를 읽기 때문)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return (
    <div className="flex h-dvh flex-col">
      {/* 개발용 화면 전환 버튼 (좁은 화면에서도 화면 폭을 넘지 않게 줄바꿈) */}
      <div className="flex flex-wrap gap-2 p-2">
        <button type="button" className="btn btn-sm" onClick={() => setView('space')}>공간</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('avatars')}>캐릭터</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('podium')}>포디움</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('forms')}>입력칸</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('wod')}>WOD</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('event')}>모임</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('wall')}>벽</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('qna')}>Q&A</button>
        <button type="button" className="btn btn-sm" onClick={() => setView('onerm')}>1RM</button>
      </div>
      {view === 'onerm' ? (
        // 1RM 기록 화면 (기록 남기기 칸: 무게 / 네임드 / Max Rep). 서버 없이 열어서 아래 목록은 불러오기 오류로 나온다
        <div className="overflow-y-auto" data-view="onerm">
          <OneRmBoard me={{ profile: DEMO, streak: 3, checkedInToday: false, bestLifts: {} }} />
        </div>
      ) : view === 'qna' ? (
        // Q&A 미리보기: 회원(내 문의) / 관리자(모든 문의, 답변 칸)
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto px-4 pb-10" data-view="qna">
          {[false, true].map((admin) => (
            <ul key={String(admin)} className="flex flex-col gap-3" data-admin={admin}>
              {[
                { id: 'q1', title: '휴회 신청은 어떻게 하나요? 다음 달에 해외 출장이 있어서 한 달 정도 쉬어야 할 것 같아요', body: '다음 달 1일부터 30일까지 쉬고 싶어요.\n방법 알려주세요!', answer: null },
                { id: 'q2', title: '주차 가능한가요?', body: '차로 가도 되나요?', answer: '건물 뒤편 주차장에 2시간 무료 주차가 돼요. 데스크에서 주차 등록을 해 주세요.' },
              ].map((d) => (
                <QnaItem
                  key={d.id}
                  isAdmin={admin}
                  onDelete={async () => {}}
                  onAnswer={async () => {}}
                  q={{ ...d, user_id: 'u1', nickname: '아주긴닉네임회원님', answered_at: d.answer ? '2026-11-13T04:00:00Z' : null, created_at: '2026-11-13T03:00:00Z', mine: !admin }}
                />
              ))}
            </ul>
          ))}
        </div>
      ) : view === 'wall' ? (
        // 명예의 벽 카드(축하 버튼) + 알림 설정(🎉 내 PR 축하, 관리자용 항목 포함)
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-y-auto px-4 pb-10" data-view="wall">
          {[
            { id: 'w1', nickname: '룰루', movement: 'clean_and_jerk', weight_lb: 215, prev_lb: null, liked: false, count: 0 },
            { id: 'w2', nickname: '아주긴닉네임회원님', movement: 'overhead_squat', weight_lb: 1205.5, prev_lb: 1100, liked: true, count: 128 },
            { id: 'w3', nickname: '코치', movement: 'murph', time_sec: 2523, prev_sec: 2600, unit: 'time', liked: false, count: 7 },
            { id: 'w4', nickname: '박회원', movement: '버피', reps: 52, minutes: 1, prev_reps: 47, unit: 'reps', liked: false, count: 3 },
            { id: 'w5', nickname: '이지은', movement: '풀업', reps: 25, minutes: 0, prev_reps: null, unit: 'reps', liked: false, count: 0 },
          ].map((d) => (
            <WallCard
              key={d.id}
              item={{
                id: d.id, kind: 'pr', created_at: '2026-11-13T03:00:00Z', user_id: 'u', nickname: d.nickname, avatar: {},
                payload: { movement: d.movement, is_custom: d.unit === 'reps', unit: (d.unit ?? 'lb') as 'lb' | 'time' | 'reps', weight_lb: d.weight_lb, prev_lb: d.prev_lb, time_sec: d.time_sec, prev_sec: d.prev_sec, reps: d.reps, minutes: d.minutes, prev_reps: d.prev_reps },
              } as FeedItem}
              cheer={{ liked: d.liked, count: d.count }}
              onCheer={() => {}}
            />
          ))}
          <NotificationSettings profile={{ ...DEMO, role: 'admin', notify_prefs: {} }} />
          {/* 알림 켜기가 멈췄을 때 안내 카드 미리보기: 삼성 인터넷 1단계 / 설치 앱 3단계 */}
          <div className="mt-4 flex flex-col gap-4" data-case="push-help">
            <PushHelp step={1} browser="installed-samsung" busy={false} onRetry={() => {}} diag={[['브라우저', '삼성 인터넷 31.0 · 안드로이드 10'], ['설치 앱으로 열림', '예'], ['알림 권한', '아직 묻지 않음'], ['알림 준비', '준비됨'], ['푸시 등록', '없음']]} />
            <PushHelp step={3} browser="installed" busy={false} onRetry={() => {}} diag={[['브라우저', '크롬 142 · 안드로이드 14'], ['설치 앱으로 열림', '예'], ['알림 권한', '허용됨'], ['알림 준비', '준비됨'], ['푸시 등록', '없음']]} />
          </div>
        </div>
      ) : view === 'event' ? (
        // 모임 상세 미리보기: 만든 사람(열림) / 만든 사람(마감됨) / 일반 회원
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 overflow-y-auto px-4 pb-10">
          {[
            { can_manage: true, closed_at: null, label: 'creator-open' },
            { can_manage: true, closed_at: '2026-11-13T02:00:00Z', label: 'creator-closed' },
            { can_manage: false, closed_at: null, label: 'member' },
          ].map((c) => (
            <div key={c.label} data-case={c.label}>
              <EventDetailView
                now={Date.parse('2026-11-13T03:00:00Z')}
                busy={false}
                actionError={null}
                onToggleJoin={() => {}}
                onToggleClose={() => {}}
                onEdit={() => {}}
                onRemove={() => {}}
                ev={{
                  id: c.label, kind: 'gathering', title: '금요일 회식 🍖', description: '참가비 2만원',
                  starts_at: '2026-11-14T10:00:00Z', location: '박스 앞 고깃집', link_url: null,
                  signup_deadline: '2026-11-14T03:00:00Z', capacity: 10, closed_at: c.closed_at,
                  created_by: 'u1', created_at: '2026-11-12T00:00:00Z', joined: false, can_manage: c.can_manage,
                  creator: { nickname: '김코치' },
                  participants: [1, 2, 3, 4].map((n) => ({ user_id: `p${n}`, nickname: `회원${n}`, avatar: {}, created_at: '2026-11-12T00:00:00Z' })),
                }}
              >
                {c.label !== 'creator-closed' && (
                  // 댓글 미리보기: 'creator-open'은 관리자로 보기(모든 댓글 삭제 가능), 'member'는 일반 회원(내 댓글만 삭제)
                  <EventComments
                    myId={DEMO.id}
                    isAdmin={c.label === 'creator-open'}
                    comments={[
                      { id: 'c1', user_id: 'admin1', nickname: '김코치', role: 'admin', avatar: {}, body: '7시까지 박스 앞에서 모여요! 늦으시는 분은 댓글 남겨 주세요 🙌', created_at: '2026-11-12T09:00:00Z' },
                      { id: 'c2', user_id: 'p2', nickname: '이지은', role: 'member', avatar: {}, body: '저는 30분 정도 늦을 것 같아요', created_at: '2026-11-12T10:00:00Z' },
                      { id: 'c3', user_id: DEMO.id, nickname: DEMO.nickname, role: 'member', avatar: {}, body: '참가합니다! 차 있으신 분 같이 가요', created_at: '2026-11-12T11:00:00Z' },
                    ]}
                    onSend={async () => true}
                    onDelete={() => {}}
                  />
                )}
              </EventDetailView>
            </div>
          ))}
        </div>
      ) : view === 'wod' ? (
        // WOD 무게 계산 미리보기: 왼쪽은 1RM 있음(백스쿼트 315 lb), 오른쪽은 1RM 없음
        <div className="mx-auto grid w-full max-w-3xl gap-4 overflow-y-auto px-4 pb-10 sm:grid-cols-2">
          {([{ back_squat: 315 }, {}] as Record<string, number>[]).map((best, i) => (
            <WodView
              key={i}
              bestLifts={best}
              wod={{
                id: 'demo', wod_date: '2026-11-13', title: 'Heavy Day',
                content: '[Strength]\nBack Squat\n5-5-3 @70%, 75%, 80%\n\n[Conditioning]\nAMRAP 12\n10 Wall Balls\n10 Box Jumps',
                lifts: [{ movement: 'back_squat', percents: [[60, 65], 70, 75] }, { movement: 'deadlift', percents: [[60, 65], 70] }],
              } as Wod}
            />
          ))}
        </div>
      ) : view === 'forms' ? (
        // 좁은 화면에서 입력칸이 넘치지 않는지 보는 미리보기 (모임 만들기 양식 + 날짜 칸)
        <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 pb-10">
          <EventForm kind="gathering" onDone={() => {}} />
          <NoticeEditor notice={null} onDone={() => {}} />
          <NaverCafeCard />
          <div className="card flex flex-col gap-2 p-4">
            <input type="date" className="input" aria-label="날짜" />
            <div className="flex gap-2">
              <input type="date" className="input" aria-label="날짜 2" />
              <button type="button" className="btn">추가</button>
            </div>
          </div>
        </div>
      ) : view === 'podium' ? (
        <div className="mx-auto w-full max-w-md p-4">
          <Podium
            myId="u2"
            rows={samples().slice(0, 3).map((a, i) => ({
              user_id: `u${i + 1}`, movement: 'back_squat', is_custom: false, unit: 'lb' as const,
              weight_lb: [315, 285, 275][i], time_sec: null, achieved_on: '2026-11-05',
              nickname: ['김코치', '미리보기', '박회원'][i], gender: 'M' as const, avatar: a,
            }))}
          />
          {/* Max Rep 순위: 1분 버피 */}
          <Podium
            myId="u2"
            rows={samples().slice(3, 6).map((a, i) => ({
              user_id: `r${i + 1}`, movement: '버피', is_custom: true, unit: 'reps' as const,
              weight_lb: null, time_sec: null, reps: [52, 48, 45][i], minutes: 1, achieved_on: '2026-11-20',
              nickname: ['박회원', '미리보기', '이지은'][i], gender: 'M' as const, avatar: a,
            }))}
          />
        </div>
      ) : view === 'space' ? (
        <div className="relative min-h-0 flex-1">
          <p id="opened" className="absolute z-10 ml-40 mt-2 rounded bg-white px-2 text-xs">열림: {opened}</p>
          <BoxSpace profile={DEMO} handleRef={space} wallNotice={{ title: demoNotice.title, isNew: demoNew }} onOpen={(b) => setOpened(`${b} @ ${new Date().toLocaleTimeString()}`)} />
          {mounted && demoPopup && <NoticePopup notice={demoNotice} onClose={() => setDemoPopup(false)} onGo={() => { setDemoPopup(false); setDemoNew(false); }} />}
          {mounted && <ChatPanel
            messages={msgs}
            notice={'회원 확인을 위해 닉네임에 이름을 넣어 주세요. 이름만 쓰셔도 되고, 이름이 들어간 별명도 괜찮습니다. 변경: ☰ 메뉴 → 캐릭터 꾸미기'}
            markerAt={demoMarker}
            readAt={demoRead}
            onRead={setDemoRead}
            myId={DEMO.id}
            canModerate={false}
            blockedReason={null}
            onSend={async (body) => {
              setMsgs((m) => [...m, { id: String(m.length + 1), user_id: DEMO.id, nickname: DEMO.nickname, body, created_at: new Date().toISOString() } as ChatMessage]);
              return true;
            }}
            onDelete={() => {}}
          />}
          <div className="absolute right-3 top-3 z-10 flex flex-col rounded-md bg-black/60 text-white">
            <button type="button" className="h-9 w-9" onClick={() => space.current?.zoomBy(1)}>＋</button>
            <button type="button" className="h-9 w-9" onClick={() => space.current?.zoomBy(-1)}>－</button>
          </div>
          {/* 실제 박스 화면처럼 액션·메뉴·배경음악을 함께 둬서 팝업이 하나만 열리는지 본다 */}
          <div className="absolute bottom-3 right-3 z-20 flex items-end gap-2">
            <ActionPad pose="stand" running={false} onAct={(a) => space.current?.act(a)} />
            <QuickMenu />
          </div>
          <div className="absolute left-3 top-12 z-20">
            <BgmControl />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 overflow-auto bg-[var(--mat)] p-3">
          {samples().map((a, i) => (
            <div key={i} className="flex justify-center gap-1 rounded bg-black/20">
              {(['down', 'right', 'up'] as const).map((d) => (
                <AvatarView key={d} avatar={a} scale={3} dir={d} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

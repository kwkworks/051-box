'use client';

import { AvatarView } from '@/components/AvatarView';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { movementLabel } from '@/lib/constants';
import { fmtTime, formatRelative } from '@/lib/format';
import type { FeedItem } from '@/lib/types';
import { RecordValue } from '@/components/RecordValue';

// 이전 최고 기록 (없으면 그 종목 첫 기록)
const prevOf = (item: FeedItem) => (item.payload.unit === 'time' ? item.payload.prev_sec : item.payload.prev_lb) ?? null;
import { useLoad } from '@/lib/useLoad';

export default function WallPage() {
  return <Guard need="member">{() => <Wall />}</Guard>;
}

function Wall() {
  const { data, error, loading, reload } = useLoad(() => api.get<{ items: FeedItem[] }>('/feed'), 'feed');

  return (
    <BoardShell title="🎉 PR 명예의 벽" subtitle="오늘 세운 최고 기록 (매일 0시에 새로 시작)">
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <p className="card p-6 text-center text-muted">오늘은 아직 PR 소식이 없어요. 1RM에서 내 최고 기록을 세우면 여기에 올라가요!</p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.items.map((item) => (
          <li key={item.id} className="card flex items-center gap-3 p-3">
            <div className="shrink-0 rounded-md bg-[var(--mat)] p-1">
              <AvatarView avatar={item.avatar} scale={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                🎉 <span className="text-[var(--burgundy)]">{item.nickname}</span>님{' '}
                {movementLabel(item.payload.movement, item.payload.is_custom)} {prevOf(item) == null ? '첫 기록!' : 'PR!'}
              </p>
              <p className="text-2xl">
                <RecordValue unit={item.payload.unit ?? 'lb'} weightLb={item.payload.weight_lb} timeSec={item.payload.time_sec} size="lg" />
                {prevOf(item) != null && (
                  <span className="ml-2 text-sm font-bold text-[var(--ok)]">
                    {item.payload.unit === 'time'
                      ? `${fmtTime(Number(item.payload.prev_sec) - Number(item.payload.time_sec))} 단축`
                      : `+${Math.round((Number(item.payload.weight_lb) - Number(item.payload.prev_lb)) * 10) / 10} lb`}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">{formatRelative(item.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </BoardShell>
  );
}

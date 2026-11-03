'use client';

import { AvatarView } from '@/components/AvatarView';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { api } from '@/lib/api';
import { movementLabel } from '@/lib/constants';
import { formatRelative } from '@/lib/format';
import type { FeedItem } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function WallPage() {
  return <Guard need="member">{() => <Wall />}</Guard>;
}

function Wall() {
  const { data, error, loading, reload } = useLoad(() => api.get<{ items: FeedItem[] }>('/feed'), 'feed');

  return (
    <BoardShell title="명예의 벽" subtitle="회원들의 PR을 축하해요">
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <p className="card p-6 text-center text-muted">아직 PR 소식이 없어요. 1RM 기록을 경신하면 여기에 자동으로 올라가요!</p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.items.map((item) => (
          <li key={item.id} className="card flex items-center gap-3 p-3">
            <div className="shrink-0 rounded-md bg-[var(--mat)] p-1">
              <AvatarView avatar={item.avatar} scale={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                🎉 <span className="text-[var(--burgundy)]">{item.nickname}</span>님{' '}
                {movementLabel(item.payload.movement, item.payload.is_custom)} PR!
              </p>
              <p className="text-2xl font-black">
                {Number(item.payload.weight_kg)}kg
                <span className="ml-2 text-sm font-bold text-[var(--ok)]">
                  +{Math.round((Number(item.payload.weight_kg) - Number(item.payload.prev_kg)) * 10) / 10}kg
                </span>
              </p>
              <p className="text-xs text-muted">{formatRelative(item.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </BoardShell>
  );
}

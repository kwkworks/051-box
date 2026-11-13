"use client";

import { useState } from "react";
import { BoardShell } from "@/components/BoardShell";
import { ErrorBox, Guard, Loading } from "@/components/Guard";
import { WallCard } from "@/components/WallCard";
import { api } from "@/lib/api";
import type { FeedItem } from "@/lib/types";

import { useLoad } from "@/lib/useLoad";

export default function WallPage() {
  return <Guard need="member">{() => <Wall />}</Guard>;
}

function Wall() {
  const { data, error, loading, reload } = useLoad(
    () => api.get<{ items: FeedItem[] }>("/feed"),
    "feed",
  );
  // 축하해요 🎉는 누르자마자 화면에 반영하고(낙관적 업데이트), 실패하면 되돌린다
  const [mine, setMine] = useState<
    Record<string, { liked: boolean; count: number }>
  >({});
  const [likeError, setLikeError] = useState<string | null>(null);
  const likeState = (item: FeedItem) =>
    mine[item.id] ?? {
      liked: Boolean(item.liked),
      count: item.like_count ?? 0,
    };
  const toggleLike = async (item: FeedItem) => {
    const before = likeState(item);
    const after = {
      liked: !before.liked,
      count: Math.max(0, before.count + (before.liked ? -1 : 1)),
    };
    setMine((m) => ({ ...m, [item.id]: after }));
    setLikeError(null);
    try {
      if (after.liked) await api.post(`/feed/${item.id}/like`);
      else await api.del(`/feed/${item.id}/like`);
    } catch (e) {
      setMine((m) => ({ ...m, [item.id]: before }));
      setLikeError(e instanceof Error ? e.message : "축하를 저장하지 못했어요");
    }
  };

  return (
    <BoardShell
      title="🎉 PR 명예의 벽"
      subtitle="오늘 세운 최고 기록 (매일 0시에 새로 시작)"
    >
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <p className="card p-6 text-center text-muted">
          오늘은 아직 PR 소식이 없어요. 1RM에서 내 최고 기록을 세우면 여기에
          올라가요!
        </p>
      )}
      {likeError && (
        <p className="mb-2 text-sm font-bold text-[var(--danger)]" role="alert">
          {likeError}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.items.map((item) => (
          <WallCard
            key={item.id}
            item={item}
            cheer={likeState(item)}
            onCheer={() => toggleLike(item)}
          />
        ))}
      </ul>
    </BoardShell>
  );
}

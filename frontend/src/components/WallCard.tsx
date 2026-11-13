"use client";

import { AvatarView } from "./AvatarView";
import { RecordValue } from "./RecordValue";
import { movementLabel } from "@/lib/constants";
import { fmtTime, formatRelative } from "@/lib/format";
import type { FeedItem } from "@/lib/types";

// 이전 최고 기록 (없으면 그 종목 첫 기록)
const prevOf = (item: FeedItem) =>
  (item.payload.unit === "time"
    ? item.payload.prev_sec
    : item.payload.prev_lb) ?? null;

// PR 명예의 벽 카드 하나 (오른쪽에 축하해요 🎉 버튼). 페이지와 개발용 미리보기가 함께 쓴다
export function WallCard({
  item,
  cheer,
  onCheer,
}: {
  item: FeedItem;
  cheer: { liked: boolean; count: number };
  onCheer: () => void;
}) {
  return (
    <li className="card flex items-center gap-3 p-3">
      <div className="shrink-0 rounded-md bg-[var(--mat)] p-1">
        <AvatarView avatar={item.avatar} scale={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          🎉 <span className="text-[var(--burgundy)]">{item.nickname}</span>님{" "}
          {movementLabel(item.payload.movement, item.payload.is_custom)}{" "}
          {prevOf(item) == null ? "첫 기록!" : "PR!"}
        </p>
        <p className="text-2xl">
          <RecordValue
            unit={item.payload.unit ?? "lb"}
            weightLb={item.payload.weight_lb}
            timeSec={item.payload.time_sec}
            size="lg"
          />
          {prevOf(item) != null && (
            <span className="ml-2 text-sm font-bold text-[var(--ok)]">
              {item.payload.unit === "time"
                ? `${fmtTime(Number(item.payload.prev_sec) - Number(item.payload.time_sec))} 단축`
                : `+${Math.round((Number(item.payload.weight_lb) - Number(item.payload.prev_lb)) * 10) / 10} lb`}
            </span>
          )}
        </p>
        <p className="text-xs text-muted">{formatRelative(item.created_at)}</p>
      </div>
      <button
        type="button"
        className={`flex shrink-0 flex-col items-center rounded-lg border-2 px-2.5 py-1.5 text-xs font-bold ${cheer.liked ? "border-ink bg-yellow" : "border-ink/25 bg-white"}`}
        aria-pressed={cheer.liked}
        aria-label={`축하해요 ${cheer.count}명${cheer.liked ? ", 나도 축하함" : ""}`}
        onClick={onCheer}
      >
        <span className="text-xl leading-none" aria-hidden>
          🎉
        </span>
        <span className="mt-0.5 whitespace-nowrap">축하 {cheer.count}</span>
      </button>
    </li>
  );
}

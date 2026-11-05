import { AvatarView } from './AvatarView';
import { RecordValue } from './RecordValue';
import type { RankRow } from '@/lib/types';

// 1·2·3위 시상대: 가운데 1위(가장 높게), 왼쪽 2위, 오른쪽 3위. 각자 캐릭터가 단 위에 선다
const PLACES = [
  { rank: 2, medal: '🥈', height: 'h-20', color: 'bg-[#C9CDD4]' },
  { rank: 1, medal: '🥇', height: 'h-28', color: 'bg-[#E8B923]' },
  { rank: 3, medal: '🥉', height: 'h-16', color: 'bg-[#D08B4F]' },
] as const;

export function Podium({ rows, myId }: { rows: RankRow[]; myId: string }) {
  return (
    <div className="card mb-2 overflow-hidden px-2 pt-8" style={{ background: "linear-gradient(#2c2c31, #1d1d21)" }} aria-label="1·2·3위 시상대">
      <div className="grid grid-cols-3 items-end gap-2">
        {PLACES.map((place) => {
          const r = rows[place.rank - 1];
          return (
            <div key={place.rank} className="flex min-w-0 flex-col items-center">
              {r ? (
                <>
                  <span className={`max-w-full truncate rounded px-1.5 text-xs font-black ${r.user_id === myId ? 'bg-yellow text-ink' : 'bg-white/90 text-ink'} relative z-10 mb-0.5`}>
                    {r.nickname}
                  </span>
                  <AvatarView avatar={r.avatar ?? {}} scale={place.rank === 1 ? 3 : 2.5} animate={place.rank === 1} />
                </>
              ) : (
                <span className="mb-2 text-xs text-white/40">비어 있음</span>
              )}
              <div className={`flex w-full flex-col items-center justify-start rounded-t-md border-2 border-b-0 border-ink ${place.height} ${place.color}`}>
                <span className="mt-0.5 text-2xl leading-tight" aria-label={`${place.rank}위`}>
                  {place.medal}
                </span>
                {r && (
                  <span className="text-[11px] leading-tight sm:text-xs">
                    <RecordValue unit={r.unit} weightLb={r.weight_lb} timeSec={r.time_sec} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

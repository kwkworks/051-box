import type { ReactNode } from 'react';
import { movementLabel } from '@/lib/constants';
import { fixed2, lbToKg2, percentWeight } from '@/lib/format';
import { percentLabel } from '@/lib/percents';
import type { Percent } from '@/lib/types';

// 퍼센트(단일 또는 범위)에 맞는 무게 글자: "220.50 lb" / "189.00~204.75 lb", kg도 같은 모양
function weightText(best: number, p: Percent): { lb: string; kg: string } {
  const [a, b] = Array.isArray(p) ? p : [p, p];
  const wa = percentWeight(best, a);
  const wb = percentWeight(best, b);
  return a === b
    ? { lb: fixed2(wa), kg: lbToKg2(wa) }
    : { lb: `${fixed2(wa)}~${fixed2(wb)}`, kg: `${lbToKg2(wa)}~${lbToKg2(wb)}` };
}
import type { Wod } from '@/lib/types';

// WOD 본문: [Strength], [Conditioning] 같은 구역 제목 줄은 굵게
const SECTION_LINE = /^\s*\[[^\]\n]{1,30}\]\s*$/;
const STRENGTH_LINE = /^\s*\[\s*(strength|스트렝스)[^\]]*\]\s*$/i;

// 무게 칸을 넣을 줄 번호: [Strength] 구역이 끝나는 곳(다음 구역 제목 바로 앞, 없으면 본문 끝). [Strength]가 없으면 -1
function strengthEndIndex(lines: string[]): number {
  const start = lines.findIndex((l) => STRENGTH_LINE.test(l));
  if (start < 0) return -1;
  const next = lines.findIndex((l, i) => i > start && SECTION_LINE.test(l));
  let end = next < 0 ? lines.length : next;
  while (end > start + 1 && !lines[end - 1].trim()) end -= 1; // 구역 끝의 빈 줄 앞에 붙인다
  return end;
}

function WodContent({ lines, insertAt, insert }: { lines: string[]; insertAt: number; insert: ReactNode }) {
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i === insertAt) out.push(<div key="lifts">{insert}</div>);
    out.push(
      SECTION_LINE.test(line) ? (
        <p key={i} className={`font-black text-[var(--burgundy)] ${i ? 'mt-1' : ''}`}>
          {line.trim()}
        </p>
      ) : (
        <p key={i}>{line || ' '}</p>
      ),
    );
  });
  if (insertAt === lines.length) out.push(<div key="lifts">{insert}</div>);
  return <div className="whitespace-pre-wrap break-words px-4 py-4 text-[15px] leading-relaxed">{out}</div>;
}

// 1RM 기준 내 무게 (lb·kg 모두 소수점 둘째 자리). 1RM이 없으면 퍼센트만
function LiftWeights({ lifts, bestLifts, inline }: { lifts: Wod['lifts']; bestLifts: Record<string, number>; inline: boolean }) {
  return (
    <div
      className={`whitespace-normal ${inline ? 'my-2 rounded-md border-2 border-dashed border-ink/30 bg-[var(--bg)] p-3' : 'border-t-2 border-dashed border-ink/30 bg-[var(--bg)] px-4 py-4'}`}
    >
      <h3 className="mb-2 text-sm font-black">🏋️ 내 무게 (1RM 기준)</h3>
      <div className="flex flex-col gap-3">
        {lifts.map((lift, i) => {
          const best = bestLifts[lift.movement];
          return (
            <div key={i}>
              <p className="text-sm font-bold">
                {movementLabel(lift.movement)}
                {best ? (
                  <span className="ml-2 font-normal text-muted">
                    1RM {fixed2(best)} lb ({lbToKg2(best)} kg)
                  </span>
                ) : null}
              </p>
              {best ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {lift.percents.map((p, j) => {
                    const w = weightText(best, p);
                    return (
                      <span key={j} className="chip bg-yellow">
                        {`${percentLabel(p)}% → ${w.lb} lb`}
                        <span className="font-normal">({w.kg} kg)</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-sm font-bold">{lift.percents.map((p) => `${percentLabel(p)}%`).join(' · ')}</p>
                  <p className="text-xs text-muted">1RM 게시판에 기록하면 무게가 자동 계산돼요</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WodView({ wod, bestLifts }: { wod: Wod; bestLifts: Record<string, number> }) {
  const lines = wod.content ? wod.content.split(/\r\n|\r|\n/) : [];
  const hasLifts = wod.lifts.length > 0;
  // [Strength] 구역이 있으면 그 아래에, 없으면 본문 맨 아래에 무게 칸을 둔다
  const insertAt = hasLifts ? strengthEndIndex(lines) : -1;
  return (
    <article className="card overflow-hidden">
      <div className="border-b-2 border-ink bg-white px-4 py-3">
        <h2 className="text-xl font-black text-[#C2453A]">{wod.title}</h2>
      </div>
      {wod.content && (
        <WodContent lines={lines} insertAt={insertAt} insert={<LiftWeights lifts={wod.lifts} bestLifts={bestLifts} inline />} />
      )}
      {hasLifts && insertAt < 0 && <LiftWeights lifts={wod.lifts} bestLifts={bestLifts} inline={false} />}
    </article>
  );
}


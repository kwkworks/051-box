import { fmtLb, fmtTime, lbToKg } from '@/lib/format';
import type { RecordUnit } from '@/lib/types';

// 기록 값 표시: 무게는 "225 lb (102.1 kg)", 시간은 "4:05"
export function RecordValue({
  unit,
  weightLb,
  timeSec,
  size = 'md',
}: {
  unit?: RecordUnit;
  weightLb?: number | null;
  timeSec?: number | null;
  size?: 'md' | 'lg';
}) {
  if (unit === 'time') {
    return <span className="font-black tabular-nums">⏱ {timeSec ? fmtTime(timeSec) : '-'}</span>;
  }
  const lb = Number(weightLb ?? 0);
  return (
    <span className="font-black tabular-nums">
      {fmtLb(lb)}
      <span className={`ml-1 font-bold text-muted ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>({lbToKg(lb)} kg)</span>
    </span>
  );
}

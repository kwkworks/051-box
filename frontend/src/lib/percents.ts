// 서버(backend/src/percents.js)와 같은 규칙. 한쪽을 고치면 다른 쪽도 같이 고친다
import type { Percent } from './types';

// 강도(%) 글자 → 퍼센트 목록. 숫자 하나는 단일 값, [작은 수, 큰 수]는 범위.
//  - 범위: "60~65", "60-65", "60% - 65%", "60%~65%", "60%65%"(% 뒤에 바로 숫자)
//  - 따로따로: 쉼표나 띄어쓰기로 나눈 값 ("60, 65", "60 65")
//  - 30~120 사이 정수만, 최대 10개. 거꾸로 적은 범위(65~60)는 바로잡는다.
export function parsePercents(text: string): Percent[] {
  const normalized = String(text)
    .replace(/(\d)%(?=\d)/g, '$1~') // 60%65% → 60~65 (% 뒤에 바로 숫자)
    .replace(/%/g, '') // 남은 % 기호는 지운다 (60% - 65% → 60 - 65)
    .replace(/\s*[~\-–—]\s*/g, '~'); // 60 - 65, 60~65, 60–65 → 60~65
  const out: Percent[] = [];
  for (const token of normalized.split(/[,\s]+/)) {
    if (!token) continue;
    const range = token.match(/^(\d+)~(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (!valid(a) || !valid(b)) continue;
      out.push(a === b ? a : [Math.min(a, b), Math.max(a, b)]);
    } else if (/^\d+$/.test(token) && valid(Number(token))) {
      out.push(Number(token));
    }
  }
  return out.slice(0, 10);
}

function valid(n: number) {
  return Number.isInteger(n) && n >= 30 && n <= 120;
}

// 화면 표시용: 70 → "70", [60, 65] → "60~65"
export function percentLabel(p: Percent): string {
  return Array.isArray(p) ? `${p[0]}~${p[1]}` : String(p);
}

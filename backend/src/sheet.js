// 구글 시트("웹에 게시" → CSV)에서 WOD를 읽어온다.
// 보안: 구글 시트 주소만 허용하고, 응답 크기와 시간을 제한해서 이 기능이 다른 서버를 찌르는 통로(SSRF)가 되지 않게 한다.
import { normalizeSymbols, parsePercents } from './percents.js';
import { HttpError } from './errors.js';
import { MOVEMENTS } from './schemas.js';

const MAX_BYTES = 1024 * 1024;
const MAX_ROWS = 200;

export function normalizeSheetUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, '시트 주소가 올바르지 않아요');
  }
  const ok =
    url.protocol === 'https:' &&
    url.hostname === 'docs.google.com' &&
    /^\/spreadsheets\/d\/e\/[A-Za-z0-9_-]+\/pub(html)?$/.test(url.pathname);
  if (!ok) {
    throw new HttpError(400, '구글 시트의 "웹에 게시" 주소(docs.google.com/spreadsheets/d/e/.../pub)만 쓸 수 있어요');
  }
  // CSV 형식으로 고정하고, 허용한 파라미터만 남긴다
  const clean = new URL(`https://docs.google.com${url.pathname.replace(/html$/, '')}`);
  const gid = url.searchParams.get('gid');
  if (gid && /^\d{1,12}$/.test(gid)) clean.searchParams.set('gid', gid);
  clean.searchParams.set('single', 'true');
  clean.searchParams.set('output', 'csv');
  return clean.toString();
}

export async function fetchSheetCsv(sheetUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // 리다이렉트는 자동으로 따라가지 않고, 매번 구글 주소인지 확인한 뒤 최대 3번까지만 따라간다
    const allowed = (u) =>
      u.protocol === 'https:' && (u.hostname === 'docs.google.com' || u.hostname.endsWith('.googleusercontent.com'));
    let target = new URL(sheetUrl);
    let res;
    for (let hop = 0; ; hop++) {
      if (!allowed(target)) throw new HttpError(400, '구글 시트가 아닌 곳으로 연결되어 중단했어요');
      res = await fetch(target, { signal: controller.signal, redirect: 'manual' });
      if (res.status < 300 || res.status >= 400) break;
      const next = res.headers.get('location');
      if (!next || hop >= 3) throw new HttpError(400, '시트를 읽지 못했어요. "웹에 게시"가 되어 있는지 확인해주세요');
      target = new URL(next, target);
    }
    if (!res.ok) throw new HttpError(400, '시트를 읽지 못했어요. "웹에 게시"가 되어 있는지 확인해주세요');
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/csv')) {
      throw new HttpError(400, 'CSV 형식이 아니에요. 웹에 게시할 때 형식을 "쉼표로 구분된 값(.csv)"으로 골라주세요');
    }
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new HttpError(400, '시트가 너무 커요 (1MB 이하)');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, '시트에 연결하지 못했어요. 잠시 후 다시 시도해주세요');
  } finally {
    clearTimeout(timer);
  }
}

// RFC 4180 CSV 파서 (따옴표 안의 줄바꿈, 쉼표, "" 처리)
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const MOVEMENT_ALIASES = {
  백스쿼트: 'back_squat', 'back squat': 'back_squat',
  프론트스쿼트: 'front_squat', 'front squat': 'front_squat',
  오버헤드스쿼트: 'overhead_squat', 'overhead squat': 'overhead_squat', ohs: 'overhead_squat',
  데드리프트: 'deadlift', deadlift: 'deadlift', dl: 'deadlift',
  클린: 'clean', clean: 'clean',
  파워클린: 'power_clean', 'power clean': 'power_clean',
  클린앤저크: 'clean_and_jerk', 'clean and jerk': 'clean_and_jerk', 'clean & jerk': 'clean_and_jerk',
  스내치: 'snatch', snatch: 'snatch',
  파워스내치: 'power_snatch', 'power snatch': 'power_snatch',
  푸시프레스: 'push_press', 'push press': 'push_press',
  스트릭트프레스: 'strict_press', 'strict press': 'strict_press', 'shoulder press': 'strict_press',
  벤치프레스: 'bench_press', 'bench press': 'bench_press',
  쓰러스터: 'thruster', thruster: 'thruster', thrusters: 'thruster',
};

function toMovement(name) {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (MOVEMENTS.includes(key.replace(/ /g, '_'))) return key.replace(/ /g, '_');
  return MOVEMENT_ALIASES[key] ?? MOVEMENT_ALIASES[key.replace(/ /g, '')] ?? null;
}

// "백스쿼트 70,75,80 / 데드리프트 60,65" → [{movement, percents}]
export function parseLifts(cell) {
  const lifts = [];
  const warnings = [];
  for (const part of cell.split(/[\n/;|]+/)) {
    const text = normalizeSymbols(part).trim();
    if (!text) continue;
    const m = text.match(/^([^\d:]+?)\s*:?\s*([\d\s,%.~\-–—]+)$/);
    const movement = m && toMovement(m[1]);
    const percents = m ? parsePercents(m[2]) : [];
    if (!movement || !percents.length) {
      warnings.push(`강도 "${text.slice(0, 30)}"를 이해하지 못해 건너뛰었어요`);
      continue;
    }
    lifts.push({ movement, percents });
  }
  return { lifts: lifts.slice(0, 10), warnings };
}

// "2026-11-04", "2026.11.04", "2026. 11. 4", "2026/11/4" → "2026-11-04"
export function parseDate(cell) {
  const m = cell.trim().match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

const HEADERS = {
  date: ['날짜', 'date'],
  title: ['제목', 'title'],
  content: ['내용', 'content', 'wod'],
  // 051 BOX WOD 입력 양식: 스트렝스 / 본 와드 / 비고 열을 합쳐 본문으로 만든다
  strength: ['스트렝스', 'strength'],
  main: ['본 와드', '본와드', 'main wod'],
  note: ['비고 (time cap)', '비고', 'time cap', 'note'],
  lifts: ['강도', 'lifts', '강도(%)'],
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// CSV 행 → WOD 목록 (+ 건너뛴 이유). 내용이 없는 날짜 줄은 조용히 건너뛴다.
export function rowsToWods(rows, { from, to }) {
  if (!rows.length) throw new HttpError(400, '시트가 비어 있어요');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]),
  );
  const hasBody = col.content >= 0 || col.strength >= 0 || col.main >= 0;
  if (col.date < 0 || (col.title < 0 && !hasBody)) {
    throw new HttpError(400, '첫 줄에 "날짜" 열과 "제목" 또는 "스트렝스/본 와드" 열이 있어야 해요');
  }
  // 칸 안의 줄바꿈은 \r\n(붙여넣기)일 수 있어 \n으로 맞춘다 (빈 줄이 사라지지 않게)
  const cell = (r, c) => (c >= 0 ? (r[c] ?? '').replace(/\r\n?/g, '\n').trim() : '');
  const wods = [];
  const skipped = [];
  for (const [i, r] of rows.slice(1, MAX_ROWS + 1).entries()) {
    const rowNo = i + 2;
    const parts = [
      cell(r, col.content),
      cell(r, col.strength) && `[Strength]\n${cell(r, col.strength)}`,
      cell(r, col.main) && `[Conditioning]\n${cell(r, col.main)}`,
      cell(r, col.note),
    ].filter(Boolean);
    let title = cell(r, col.title).slice(0, 80);
    const rawLifts = cell(r, col.lifts);
    if (!title && !parts.length && !rawLifts) continue; // 아직 비어 있는 날짜 줄

    const date = parseDate(cell(r, col.date));
    if (!date) {
      skipped.push({ row: rowNo, reason: '날짜 형식이 올바르지 않아요 (예: 2026-11-04)' });
      continue;
    }
    if (date < from || date > to) {
      skipped.push({ row: rowNo, reason: `가져오는 기간(${from} ~ ${to}) 밖이라 건너뛰었어요` });
      continue;
    }
    if (!title) {
      const d = new Date(`${date}T00:00:00Z`);
      title = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]}) WOD`;
    }
    const content = parts.join('\n\n').slice(0, 4000);
    const { lifts, warnings } = parseLifts(rawLifts);
    for (const w of warnings) skipped.push({ row: rowNo, reason: w });
    wods.push({ wod_date: date, title, content, lifts });
  }
  // 같은 날짜가 여러 번 있으면 마지막 줄을 쓴다
  return { wods: [...new Map(wods.map((w) => [w.wod_date, w])).values()], skipped };
}

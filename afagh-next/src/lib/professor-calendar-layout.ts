export const PROFESSOR_CALENDAR_START_MINUTES = 8 * 60;
export const PROFESSOR_CALENDAR_END_MINUTES = 20 * 60;
export const PROFESSOR_CALENDAR_DAY_COUNT = 7;
export const PROFESSOR_CALENDAR_MIN_ENTRY_MINUTES = 30;

export type ProfessorCalendarWeekType = 'ALL' | 'EVEN' | 'ODD';
export type ProfessorCalendarWeekFilter = 'ALL' | 'EVEN' | 'ODD';

export interface ProfessorCalendarSchedulable {
  id: number;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  weekType: ProfessorCalendarWeekType;
}

export function professorCalendarTimeToMinutes(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function professorCalendarDayIndex(dayOfWeek: number | null | undefined): number | null {
  if (dayOfWeek == null) return null;
  const d = Number(dayOfWeek);
  if (!Number.isInteger(d) || d < 0 || d >= PROFESSOR_CALENDAR_DAY_COUNT) return null;
  return d;
}

export function professorCalendarEntryKey(row: ProfessorCalendarSchedulable): string {
  const s = String(row.startTime ?? '').slice(0, 5);
  const e = String(row.endTime ?? '').slice(0, 5);
  return `${row.id}|${row.weekType}|${row.dayOfWeek}|${s}|${e}`;
}

export function filterProfessorCalendarByWeek<T extends ProfessorCalendarSchedulable>(
  rows: T[],
  filter: ProfessorCalendarWeekFilter,
): T[] {
  if (filter === 'EVEN') return rows.filter(r => r.weekType !== 'ODD');
  if (filter === 'ODD') return rows.filter(r => r.weekType !== 'EVEN');
  return rows.slice();
}

export function professorCalendarHourLabels(): string[] {
  const out: string[] = [];
  for (let h = PROFESSOR_CALENDAR_START_MINUTES / 60; h <= PROFESSOR_CALENDAR_END_MINUTES / 60; h += 1) {
    out.push(`${String(h).padStart(2, '0')}:00`);
  }
  return out;
}

export interface ProfessorCalendarPlacement<T> {
  entry: T;
  key: string;
  topPercent: number;
  heightPercent: number;
  leftPercent: number;
  widthPercent: number;
  column: number;
  columnCount: number;
  clipped: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function layoutProfessorCalendarDay<T extends ProfessorCalendarSchedulable>(
  dayEntries: T[],
): ProfessorCalendarPlacement<T>[] {
  const start0 = PROFESSOR_CALENDAR_START_MINUTES;
  const end0 = PROFESSOR_CALENDAR_END_MINUTES;
  const total = end0 - start0;
  const items = dayEntries
    .map(entry => {
      const start = professorCalendarTimeToMinutes(entry.startTime);
      const end = professorCalendarTimeToMinutes(entry.endTime);
      return { entry, start, end };
    })
    .filter((x): x is { entry: T; start: number; end: number } => x.start != null && x.end != null && x.end > x.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: ProfessorCalendarPlacement<T>[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnd: number[] = [];
    const assigned = cluster.map(item => {
      let c = colEnd.findIndex(e => e <= item.start);
      if (c === -1) {
        c = colEnd.length;
        colEnd.push(item.end);
      } else {
        colEnd[c] = item.end;
      }
      return { item, col: c };
    });
    const n = colEnd.length;
    for (const { item, col } of assigned) {
      const cs = Math.min(Math.max(item.start, start0), end0);
      const ce = Math.min(Math.max(item.end, start0), end0);
      let top = ((cs - start0) / total) * 100;
      const height = (Math.max(ce - cs, PROFESSOR_CALENDAR_MIN_ENTRY_MINUTES) / total) * 100;
      if (top + height > 100) top = Math.max(0, 100 - height);
      out.push({
        entry: item.entry,
        key: professorCalendarEntryKey(item.entry),
        topPercent: round2(top),
        heightPercent: round2(height),
        leftPercent: round2((col / n) * 100),
        widthPercent: round2(100 / n),
        column: col,
        columnCount: n,
        clipped: item.start < start0 || item.end > end0,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

export function layoutProfessorCalendarWeek<T extends ProfessorCalendarSchedulable>(
  rows: T[],
): Map<number, ProfessorCalendarPlacement<T>[]> {
  const byDay = new Map<number, T[]>();
  for (let d = 0; d < PROFESSOR_CALENDAR_DAY_COUNT; d += 1) byDay.set(d, []);
  for (const r of rows) {
    const d = professorCalendarDayIndex(r.dayOfWeek);
    if (d == null) continue;
    byDay.get(d)!.push(r);
  }
  const out = new Map<number, ProfessorCalendarPlacement<T>[]>();
  for (const [d, list] of byDay) out.set(d, layoutProfessorCalendarDay(list));
  return out;
}

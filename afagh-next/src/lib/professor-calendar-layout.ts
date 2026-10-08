export const PROFESSOR_CALENDAR_START_MINUTES = 8 * 60;
export const PROFESSOR_CALENDAR_END_MINUTES = 20 * 60;
export const PROFESSOR_CALENDAR_DAY_COUNT = 7;
export const PROFESSOR_CALENDAR_MIN_ENTRY_MINUTES = 30;

export type ProfessorCalendarWeekType = 'ALL' | 'EVEN' | 'ODD' | 'BOTH';
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
  if (filter === 'EVEN') return rows.filter(r => r.weekType === 'ALL' || r.weekType === 'EVEN' || r.weekType === 'BOTH');
  if (filter === 'ODD') return rows.filter(r => r.weekType === 'ALL' || r.weekType === 'ODD' || r.weekType === 'BOTH');
  return rows.slice();
}

export type MergeSlotLike = {
  dayOfWeek?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  roomKey?: string | number | null;
};

export function normMergeTime(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function mergedGroupKey(
  sharedScheduleGroupKey: string | null | undefined,
  slots: MergeSlotLike | MergeSlotLike[],
): string | null {
  const shared = String(sharedScheduleGroupKey ?? '').trim();
  if (shared) return `K:${shared}`;
  const list = (Array.isArray(slots) ? slots : [slots])
    .map(s => {
      const st = normMergeTime(s.startTime);
      const en = normMergeTime(s.endTime);
      if (s.dayOfWeek == null || !st || !en) return null;
      const room = s.roomKey == null || String(s.roomKey) === '' ? '-' : String(s.roomKey);
      return `${s.dayOfWeek}|${st}|${en}|${room}`;
    })
    .filter((x): x is string => x != null);
  if (list.length === 0) return null;
  return `S:${[...new Set(list)].sort().join(';')}`;
}

export type MergedGroup<T> = {
  key: string | null;
  merged: boolean;
  primaryId: number;
  memberIds: number[];
  members: T[];
};

export function groupIntoMerged<T>(
  items: T[],
  idOf: (item: T) => number,
  keyOf: (item: T) => string | null,
): MergedGroup<T>[] {
  const groups: MergedGroup<T>[] = [];
  const byKey = new Map<string, MergedGroup<T>>();
  for (const item of items) {
    const k = keyOf(item);
    if (k == null) {
      groups.push({ key: null, merged: false, primaryId: idOf(item), memberIds: [idOf(item)], members: [item] });
      continue;
    }
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, merged: false, primaryId: idOf(item), memberIds: [], members: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    g.members.push(item);
    g.memberIds.push(idOf(item));
  }
  for (const g of groups) {
    if (g.members.length > 1) {
      g.merged = true;
      g.members.sort((a, b) => idOf(a) - idOf(b));
      g.memberIds = g.members.map(idOf);
      g.primaryId = g.memberIds[0];
    }
  }
  return groups;
}

export interface ProfessorCalendarCollapseRow {
  id: number;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  weekType: ProfessorCalendarWeekType;
  code?: string;
  title?: string;
  groupNumber?: number;
  units?: number;
  enrolledCount?: number | null;
  capacity?: number | null;
  roomName?: string | null;
  buildingName?: string | null;
  roomKey?: string | number | null;
  sharedScheduleGroupKey?: string | null;
  merged?: boolean;
}

const finiteNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function collapseCalendarEntries<T extends ProfessorCalendarCollapseRow>(rows: T[]): T[] {
  const groups = groupIntoMerged(
    rows,
    r => r.id,
    r => {
      const slot = mergedGroupKey(null, {
        dayOfWeek: r.dayOfWeek ?? null,
        startTime: r.startTime ?? '',
        endTime: r.endTime ?? '',
        roomKey: r.roomKey ?? r.roomName ?? null,
      });
      const shared = String(r.sharedScheduleGroupKey ?? '').trim();
      if (slot == null) return shared ? `K:${shared}` : null;
      return shared ? `K:${shared}|${slot}` : slot;
    },
  );
  const out: T[] = [];
  for (const g of groups) {
    if (!g.merged) {
      out.push(g.members[0]);
      continue;
    }
    const primary = g.members.find(m => m.id === g.primaryId) ?? g.members[0];
    const codes = [...new Set(g.members.map(m => String(m.code ?? '').trim()).filter(c => c !== ''))];
    const weekSet = new Set(g.members.map(m => String(m.weekType)));
    const weekType = (weekSet.size === 1 ? primary.weekType : 'BOTH') as T['weekType'];
    const perId = new Map<number, T>();
    for (const m of g.members) if (!perId.has(m.id)) perId.set(m.id, m);
    const uniq = [...perId.values()];
    const multiOffering = uniq.length > 1;
    const enrolledParts = uniq.map(m => finiteNum(m.enrolledCount)).filter((v): v is number => v != null);
    const capacityParts = uniq.map(m => finiteNum(m.capacity)).filter((v): v is number => v != null);
    const unitParts = uniq.map(m => finiteNum(m.units)).filter((v): v is number => v != null);
    out.push({
      ...primary,
      code: (codes.length > 0 ? codes.join(' / ') : primary.code) as T['code'],
      title: primary.title as T['title'],
      weekType,
      merged: (multiOffering || primary.merged === true) as T['merged'],
      enrolledCount: (enrolledParts.length > 0
        ? enrolledParts.reduce((s, v) => s + v, 0)
        : primary.enrolledCount) as T['enrolledCount'],
      capacity: (capacityParts.length > 0 ? Math.max(...capacityParts) : primary.capacity) as T['capacity'],
      units: (unitParts.length > 0 ? Math.max(...unitParts) : primary.units) as T['units'],
    } as T);
  }
  return out;
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

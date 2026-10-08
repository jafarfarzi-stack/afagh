export const ATTENDANCE_DAY_NAMES: Record<number, string> = {
  1: 'شنبه',
  2: 'یکشنبه',
  3: 'دوشنبه',
  4: 'سه‌شنبه',
  5: 'چهارشنبه',
  6: 'پنج‌شنبه',
  7: 'جمعه',
};

export function dayOfWeekToName(dow: number | null | undefined): string {
  if (dow == null) return '';
  return ATTENDANCE_DAY_NAMES[Number(dow)] ?? '';
}

export type AttendanceWeekType = 'ALL' | 'EVEN' | 'ODD';

export function weekTypeLabel(scheduleType: string | null | undefined): string {
  const v = String(scheduleType ?? 'ALL').toUpperCase();
  if (v === 'EVEN') return 'هفته زوج';
  if (v === 'ODD') return 'هفته فرد';
  return 'هر هفته';
}

export interface AttendanceScheduleRow {
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  scheduleType?: string | null;
}

export function formatScheduleLabel(rows: AttendanceScheduleRow[]): string {
  const items = rows.filter(r => r.dayOfWeek != null);
  if (items.length === 0) return 'زمان کلاس ثبت نشده';
  return items
    .map(r => {
      const range = `${String(r.startTime).slice(0, 5)} الی ${String(r.endTime).slice(0, 5)}`;
      const base = `${dayOfWeekToName(r.dayOfWeek)}‌ها ${range}`;
      const wt = String(r.scheduleType ?? 'ALL').toUpperCase();
      if (wt === 'EVEN' || wt === 'ODD') return `${base} (${weekTypeLabel(wt)})`;
      return base;
    })
    .join('؛ ');
}

export interface RefreshableOffering {
  id: number;
  sessions: unknown[];
}

export function mergeRefreshedOfferings<T extends RefreshableOffering>(prev: T[], fresh: T[]): T[] {
  const freshById = new Map<number, T>(fresh.map(f => [f.id, f]));
  const out = prev.map(o => {
    const f = freshById.get(o.id);
    if (f && o.sessions.length === 0 && f.sessions.length > 0) return f;
    return o;
  });
  for (const f of fresh) {
    if (!prev.some(o => o.id === f.id)) out.push(f);
  }
  return out;
}

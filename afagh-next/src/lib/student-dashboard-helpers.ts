export const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export function toShamsi(dStr: string | null | undefined): string {
  if (!dStr) return '—';
  if (dStr.startsWith('13') || dStr.startsWith('14') || dStr.startsWith('۱۴') || dStr.startsWith('۱۳')) {
    return dStr;
  }
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return dStr;
  }
}

export type ProfNameRow = {
  staffId: number;
  firstName: string | null;
  lastName: string | null;
};

export function buildProfNameMap(rows: readonly ProfNameRow[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const p of rows) {
    map.set(p.staffId, `${p.firstName || ''} ${p.lastName || ''}`.trim());
  }
  return map;
}

export type DashboardScheduleRow = {
  offeringId: number;
  scheduleType: string | null;
  dayOfWeek: number | null;
  examDate: string | Date | null;
  startTime: string;
  endTime: string;
  roomName: string | null;
  buildingName: string | null;
};

export type DashboardScheduleEntry = {
  classes: {
    dayOfWeek: number;
    dayName: string;
    startTime: string;
    endTime: string;
    room: string;
    building?: string;
  }[];
  exam?: {
    examDate: string;
    startTime: string;
    endTime: string;
    room?: string;
  };
};

export function buildDashboardScheduleMap(rows: readonly DashboardScheduleRow[]): Map<number, DashboardScheduleEntry> {
  const map = new Map<number, DashboardScheduleEntry>();
  for (const s of rows) {
    if (!map.has(s.offeringId)) map.set(s.offeringId, { classes: [] });
    const entry = map.get(s.offeringId)!;
    if (s.scheduleType === 'CLASS' && s.dayOfWeek != null) {
      entry.classes.push({
        dayOfWeek: s.dayOfWeek,
        dayName: DAY_NAMES[s.dayOfWeek] || `روز ${s.dayOfWeek}`,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'کلاس تئوری',
        building: s.buildingName || undefined,
      });
    } else if (s.scheduleType === 'EXAM' && s.examDate) {
      entry.exam = {
        examDate: String(s.examDate),
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        room: s.roomName || 'سالن امتحانات مرکزی',
      };
    }
  }
  return map;
}

export type DashboardTermOption = {
  id: number;
  title: string;
};

export type DashboardTermScope = {
  terms: DashboardTermOption[];
  selectedId: number | null;
  effectiveId: number | null;
};

export function resolveDashboardTerm<T extends DashboardTermOption>(scope: {
  terms: T[];
  selectedId: number | null;
  effectiveId: number | null;
}): { filteredTerm: T | null; term: T | null } {
  const filteredTerm = scope.selectedId ? scope.terms.find(t => t.id === scope.selectedId) ?? null : null;
  const term = filteredTerm ?? scope.terms.find(t => t.id === scope.effectiveId) ?? null;
  return { filteredTerm, term };
}

export function distinctIds(values: readonly (number | null | undefined)[]): number[] {
  return [...new Set(values.filter((v): v is number => v != null))];
}

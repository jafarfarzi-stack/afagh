export const PROFESSOR_GRID_DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

export type ProfessorGridTimeSlot = {
  id: number;
  start: string;
  end: string;
  label: string;
};

const fa = (s: string) => s.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export const PROFESSOR_GRID_TIME_SLOTS: ProfessorGridTimeSlot[] = [
  { id: 1, start: '08:00', end: '10:00', label: `${fa('08:00')} الی ${fa('10:00')}` },
  { id: 2, start: '10:00', end: '12:00', label: `${fa('10:00')} الی ${fa('12:00')}` },
  { id: 3, start: '13:30', end: '15:30', label: `${fa('13:30')} الی ${fa('15:30')}` },
  { id: 4, start: '15:30', end: '17:30', label: `${fa('15:30')} الی ${fa('17:30')}` },
  { id: 5, start: '17:30', end: '19:30', label: `${fa('17:30')} الی ${fa('19:30')}` },
];

const toMinutes = (value: string | null | undefined): number => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const professorTimeToMinutes = toMinutes;

export type ProfessorRangeMatch = {
  slotIds: number[];
  outsideStandardSlots: boolean;
};

/**
 * بازه‌های جدولی که یک کلاس داخلشان دیده می‌شود.
 *
 * معیار «هم‌پوشانی» است نه «احاطهٔ کامل بازه». ساعت‌های واقعیِ ثبت‌شده در
 * پایگاه داده (۰۹:۴۰–۱۱:۱۰، ۱۳:۰۰–۱۴:۳۰، ۱۴:۴۰–۱۶:۱۰ و …) داخل هیچ بازهٔ
 * ثابتِ دو ساعته‌ای جا نمی‌شوند؛ با شرط احاطه بی‌صدا از جدول حذف می‌شدند و
 * صفحه خالی دیده می‌شد. اگر بازه اصلاً با هیچ بازهٔ جدولی هم‌پوشانی نداشته
 * باشد، `outsideStandardSlots` پرچم می‌خورد تا آن کلاس در جای درستش
 * (فهرست ساعت‌های خارج از شبکهٔ جدول) نشان داده شود، نه اینکه ناپدید شود.
 */
export function professorRangeMatch(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): ProfessorRangeMatch {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return { slotIds: [], outsideStandardSlots: true };
  }
  const slotIds = PROFESSOR_GRID_TIME_SLOTS.filter(
    slot => start < toMinutes(slot.end) && end > toMinutes(slot.start),
  ).map(slot => slot.id);
  return { slotIds, outsideStandardSlots: slotIds.length === 0 };
}

export type ProfessorScheduleLike = {
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
};

/** کلاسی که ساعت و روز معتبر دارد = قابل نمایش در جدول هفتگی */
export const hasProfessorSchedule = (row: ProfessorScheduleLike): boolean =>
  row.dayOfWeek != null &&
  !Number.isNaN(toMinutes(row.startTime)) &&
  !Number.isNaN(toMinutes(row.endTime)) &&
  toMinutes(row.endTime) > toMinutes(row.startTime);

export type ProfessorScheduleRow = {
  id: number;
  code: string;
  title: string;
  units: number;
  courseType: 'پایه' | 'اصلی' | 'تخصصی' | 'عمومی' | 'عملی';
  groupNumber: number;
  enrolledCount: number;
  capacity: number;
  dayOfWeek: number | null;
  dayName: string;
  startTime: string;
  endTime: string;
  roomName: string;
  buildingName: string;
  weekType: 'ALL' | 'EVEN' | 'ODD';
  isCoTaught: boolean;
  coRole?: 'THEORY' | 'LAB';
  coPartnerName?: string;
  hasSchedule: boolean;
  outsideStandardSlots: boolean;
};

/** ارائه‌های یکتای استاد در یک ترم، مستقل از تعداد ردیف‌های زمان‌بندی */
export function professorUniqueOfferings(rows: ProfessorScheduleRow[]): ProfessorScheduleRow[] {
  const out: ProfessorScheduleRow[] = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

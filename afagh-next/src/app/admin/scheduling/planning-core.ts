// ═══════════════════════════════════════════════════════════════════════
//  هستهٔ خالص کارتابل برنامه‌ریزی — بدون React و بدون فراخوانی سرور.
//  هر چه اینجا هست تابع خالص است: ورودی مشخص، خروجی مشخص، قابل Unit Test.
// ═══════════════════════════════════════════════════════════════════════
import type {
  AutoScheduleScenario, ClassroomOption, CohortOption, CourseDemand,
  DepartmentOffering, PlanningTab, ProfessorOption, SchedulingWorkspace, TimeSlot, WeekView,
} from './types';

/**
 * استادِ «تهی» برای وقتی هنوز هیچ استادی در سامانه ثبت نشده (دانشگاهِ تازه‌راه‌افتاده).
 * بدون این، `professors[0]` برابر undefined می‌شد و خواندن `.id` روی آن کل
 * صفحه را — چه در سرور چه در مرورگر — از کار می‌انداخت.
 */
export const NO_PROFESSOR: ProfessorOption = {
  id: 0, name: '— استادی ثبت نشده —', staffCode: '', academicRank: '—',
  contractType: 'تمام‌وقت', departmentName: '—', maxWeeklyUnits: 1,
  maxDailyHours: 0, hasSubmittedAvailability: false,
};

export const faNum = (n: number | string | null | undefined) => (n === null || n === undefined ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));

export const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه'];
export const faToEnDigits = (s: string) =>
  String(s)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * استخراج تاریخ‌های 'YYYY/MM/DD' از متن آزاد (تعطیلات).
 * ⚠️ رقوم اول به لاتین تبدیل می‌شوند: کاربر در فیلد «تعطیلات» طبیعی است
 *    «۱۴۰۵/۰۷/۰۱» تایپ کند؛ نسخهٔ قبلی فقط لاتین را می‌خواند و تعطیلِ
 *    فارسی‌رقم بی‌صدا نادیده گرفته می‌شد ⇒ جلسه در روز تعطیل تولید می‌شد.
 */
export const parseJalaliDates = (s: string): string[] => {
  const norm = faToEnDigits(String(s));
  return (norm.match(/\d{4}\s*[/٫]\s*\d{1,2}\s*[/٫]\s*\d{1,2}/g) || [])
    .map(p => p.replace(/\s+/g, '').replace(/٫/g, '/'));
};
export function mapDemands(demands: SchedulingWorkspace['demands']): CourseDemand[] {
  return demands.map(d => ({
    id: d.offeringId,
    courseId: d.courseId,
    courseDeptId: d.courseDeptId,
    programId: d.programId,
    programTitle: d.programTitle,
    cohortId: d.cohortId,
    cohortTitle: d.cohortTitle,
    code: d.code,
    title: d.title,
    units: Number(d.units) || 0,
    groupNumber: d.groupNumber,
    courseType: (['پایه', 'اصلی', 'تخصصی', 'عمومی', 'عملی'].includes(d.courseType) ? d.courseType : 'عمومی') as CourseDemand['courseType'],
    preferredProfId: d.professorId ?? 0,
    isCoTaught: d.isCoTaught || undefined,
    requiredRoomType: 'THEORY',
    capacity: d.capacity,
    groupsCount: 1,
    weekRecurrence: 'ALL',
    sessionsCountPerWeek: 1,
    examDate: '',
  }));
}

export function mapClassrooms(rooms: SchedulingWorkspace['classrooms'], allocatedRoomIds: number[]): ClassroomOption[] {
  return rooms.map(r => ({
    id: r.id,
    name: r.name,
    buildingName: r.buildingName,
    capacity: r.capacity,
    roomType: (['THEORY', 'LAB', 'GYM', 'EXAM'].includes(r.roomType) ? r.roomType : 'THEORY') as ClassroomOption['roomType'],
    equipment: [],
    isActive: true,
    isAllocatedToDept: allocatedRoomIds.includes(r.id),
  }));
}
/** سقف‌های تدریس استاد فعلاً ستون دیتابیسی ندارند (گپ شناخته‌شدهٔ طراحی)؛ پیش‌فرض صریح */
export const PROF_DEFAULT_MAX_UNITS = 16;
export const PROF_DEFAULT_MAX_DAILY_HOURS = 6;

export function mapProfessors(profs: SchedulingWorkspace['professors'], avail: SchedulingWorkspace['availabilities']): ProfessorOption[] {
  return profs.map(p => ({
    id: p.id,
    name: p.name,
    staffCode: p.staffCode ?? '—',
    academicRank: p.academicRank ?? '—',
    contractType: 'تمام‌وقت',
    departmentName: p.departmentName ?? '—',
    maxWeeklyUnits: PROF_DEFAULT_MAX_UNITS,
    maxDailyHours: PROF_DEFAULT_MAX_DAILY_HOURS,
    hasSubmittedAvailability: avail.some(a => a.staffId === p.id),
  }));
}

export function mapCohorts(cohorts: SchedulingWorkspace['cohorts']): CohortOption[] {
  return cohorts.map(c => ({
    id: String(c.entryYear),
    entryYear: faNum(c.entryYear),
    semesterNo: 0,
    title: `ورودی ${faNum(c.entryYear)}`,
    expectedStudents: c.expectedStudents,
  }));
}

export function mapOfferings(rows: SchedulingWorkspace['approvedOfferings']): DepartmentOffering[] {
  return rows.map(r => ({
    id: r.offeringId,
    termId: 0,
    programId: 0,
    programTitle: 'همهٔ رشته‌ها',
    cohortId: 'ALL',
    cohortTitle: 'کلیهٔ ورودی‌ها',
    courseId: r.offeringId,
    code: r.code,
    title: r.title,
    units: Number(r.units) || 0,
    courseType: r.courseType,
    groupNumber: r.groupNumber,
    professorId: r.professorId ?? 0,
    professorName: r.professorName,
    capacity: r.capacity,
    enrolledCount: r.enrolledCount,
    waitlistCapacity: 0,
    classSchedules: [{
      dayOfWeek: (r.dayOfWeek ?? 1) - 1,
      dayName: r.dayName,
      slotId: 0,
      startTime: r.startTime,
      endTime: r.endTime,
      roomId: r.roomId ?? 0,
      roomName: r.roomName,
      buildingName: r.buildingName,
      weekType: 'ALL',
    }],
    examSchedule: null,
  }));
}

export const PHASE_LABELS: Record<string, string> = {
  SUPPLY: 'تأمین (فاز ۱)',
  ALLOCATION: 'تخصیص (فاز ۲)',
  REVIEW: 'بازبینی کارشناس (فاز ۳)',
  PUBLISHED: 'منتشرشده (فاز ۴)',
};
// ==========================================
// BELL SCHEDULE PRESETS
// ==========================================

export const TIME_SLOT_PRESETS = {
  STANDARD_120: {
    name: 'الگوی ۱۲۰ دقیقه‌ای (۲ ساعته استاندارد)',
    description: 'کلاس‌های ۲ ساعته استاندارد دانشگاه‌ها با ۳۰ دقیقه استراحت بین کلاس‌ها',
    slots: [
      { id: 1, label: '۰۸:۰۰ الی ۱۰:۰۰', startTime: '08:00', endTime: '10:00', isBreak: false },
      { id: 2, label: '۱۰:۰۰ الی ۱۲:۰۰', startTime: '10:00', endTime: '12:00', isBreak: false },
      { id: 3, label: '۱۲:۰۰ الی ۱۳:۳۰ (نماز و ناهار)', startTime: '12:00', endTime: '13:30', isBreak: true },
      { id: 4, label: '۱۳:۳۰ الی ۱۵:۳۰', startTime: '13:30', endTime: '15:30', isBreak: false },
      { id: 5, label: '۱۵:۳۰ الی ۱۷:۳۰', startTime: '15:30', endTime: '17:30', isBreak: false },
      { id: 6, label: '۱۷:۳۰ الی ۱۹:۳۰', startTime: '17:30', endTime: '19:30', isBreak: false },
    ],
  },
  STANDARD_90: {
    name: 'الگوی ۹۰ دقیقه‌ای (۱٫۵ ساعته سراسری)',
    description: 'کلاس‌های ۱٫۵ ساعته مناسب دروس ۳ واحدی (۲ جلسه ۹۰ دقیقه‌ای در هفته)',
    slots: [
      { id: 1, label: '۰۸:۰۰ الی ۰۹:۳۰', startTime: '08:00', endTime: '09:30', isBreak: false },
      { id: 2, label: '۰۹:۴۵ الی ۱۱:۱۵', startTime: '09:45', endTime: '11:15', isBreak: false },
      { id: 3, label: '۱۱:۳۰ الی ۱۳:۰۰', startTime: '11:30', endTime: '13:00', isBreak: false },
      { id: 4, label: '۱۳:۰۰ الی ۱۳:۴۵ (نماز و ناهار)', startTime: '13:00', endTime: '13:45', isBreak: true },
      { id: 5, label: '۱۳:۴۵ الی ۱۵:۱۵', startTime: '13:45', endTime: '15:15', isBreak: false },
      { id: 6, label: '۱۵:۳۰ الی ۱۷:۰۰', startTime: '15:30', endTime: '17:00', isBreak: false },
      { id: 7, label: '۱۷:۱۵ الی ۱۸:۴۵', startTime: '17:15', endTime: '18:45', isBreak: false },
    ],
  },
  STANDARD_60: {
    name: 'الگوی ۶۰ دقیقه‌ای (۱ ساعته کارگاهی/فشرده)',
    description: 'کلاس‌های ۱ ساعته مناسب کارگاه‌ها و جلسات رفع اشکال و تمرین',
    slots: [
      { id: 1, label: '۰۸:۰۰ الی ۰۹:۰۰', startTime: '08:00', endTime: '09:00', isBreak: false },
      { id: 2, label: '۰۹:۱۵ الی ۱۰:۱۵', startTime: '09:15', endTime: '10:15', isBreak: false },
      { id: 3, label: '۱۰:۳۰ الی ۱۱:۳۰', startTime: '10:30', endTime: '11:30', isBreak: false },
      { id: 4, label: '۱۱:۴۵ الی ۱۲:۴۵', startTime: '11:45', endTime: '12:45', isBreak: false },
      { id: 5, label: '۱۲:۴۵ الی ۱۳:۴۵ (نماز و ناهار)', startTime: '12:45', endTime: '13:45', isBreak: true },
      { id: 6, label: '۱۳:۴۵ الی ۱۴:۴۵', startTime: '13:45', endTime: '14:45', isBreak: false },
      { id: 7, label: '۱۵:۰۰ الی ۱۶:۰۰', startTime: '15:00', endTime: '16:00', isBreak: false },
      { id: 8, label: '۱۶:۱۵ الی ۱۷:۱۵', startTime: '16:15', endTime: '17:15', isBreak: false },
    ],
  },
};
// ═══════════════════════════════════════════════════════════════════════
// تنها «سناریوی» مشروع: برنامهٔ مصوب (approvedOfferings از DB)
// هیچ Solver در کلاینت نیست — پیشنهادها از موتور سرور (getSmartSuggestionsAction) می‌آیند.
// ═══════════════════════════════════════════════════════════════════════

export function buildRealScenario(
  offerings: DepartmentOffering[],
  hardConflicts: number,
  sessionsTotal: number,
  roomGrants: number,
): AutoScheduleScenario {
  const distinctDays = new Set(offerings.flatMap(o => o.classSchedules.map(cs => cs.dayOfWeek))).size;
  return {
    id: 'BALANCED',
    title: 'برنامهٔ مصوب ترم (دادهٔ واقعی از DB)',
    subtitle: 'جدول‌های نمایشی از schedules و class_sessions ساخته می‌شوند — بدون محاسبهٔ محلی.',
    description: 'این جدول همان برنامهٔ ثبت‌شده در پایگاه داده است؛ هیچ سناریویی در مرورگر ساخته نمی‌شود.',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    accentBorder: 'border-emerald-300',
    bgGradient: 'from-emerald-50 to-white',
    kpi: {
      daysPerWeek: faNum(distinctDays),
      profSatisfaction: '—',
      conflictsRate: hardConflicts > 0 ? `${faNum(hardConflicts)} تداخل سخت` : 'صفر',
      roomEfficiency: faNum(roomGrants),
      studentComfort: '—',
      commuteScore: faNum(sessionsTotal) + ' جلسه',
    },
    offerings,
  };
}

// ──────────────── منطق خالص (اولین بار در این دور از کامپوننت بیرون آمد) ────────────────

/** صفحه‌بندی جدول تقاضا: هر بار ۱۰۰ ردیف — ردیف‌های این جدول سنگین‌اند */
export const DEMAND_PAGE = 100;

/** تب‌های مشروع کارتابل — تنها ورودی قابل قبول برای ?tab= */
export const PLANNING_TABS = [
  'CURRICULUM_ASSIGN', 'PROF_QUOTAS', 'DEPT_ROOMS', 'SCENARIOS',
  'PROFESSOR_SCHEDULE', 'APPROVED', 'TERM_CALENDAR',
] as const satisfies readonly PlanningTab[];

/**
 * تب آغازین از query string (`/admin/scheduling?tab=SCENARIOS`).
 * مقدار نامعتبر/خالی هرگز state را نمی‌شکند → همیشه به تب ۱ برمی‌گردد.
 */
export function resolveTab(v: string | null | undefined): PlanningTab {
  const s = (v ?? '').trim().toUpperCase();
  return (PLANNING_TABS as readonly string[]).includes(s) ? (s as PlanningTab) : 'CURRICULUM_ASSIGN';
}

/**
 * بار واحد هر استاد از روی تقاضاها، با احتساب درس‌های مشترک (تئوری/عملی).
 * ⚠️ قبلاً داخل useMemo کامپوننت بود؛ بیرون‌آمدنش یعنی «سقف واحد و تقسیم سهم»
 *    حالا قابل Unit Test است → tests/scheduling-planning-core.test.ts
 */
export function computeProfUnits(
  demands: CourseDemand[],
  professors: ProfessorOption[],
): { [profId: number]: { units: number; coursesCount: number } } {
  const map: { [profId: number]: { units: number; coursesCount: number } } = {};
  professors.forEach(p => { map[p.id] = { units: 0, coursesCount: 0 }; });

  demands.forEach(d => {
    const primaryProfId = d.preferredProfId;
    if (d.isCoTaught && d.coProfId) {
      const theoryUnits = Math.round((d.units * (d.theoryWeightRatio || 0.70)) * 10) / 10;
      const labUnits = Math.round((d.units * (d.labWeightRatio || 0.30)) * 10) / 10;
      if (map[primaryProfId]) {
        map[primaryProfId].units += (theoryUnits * d.groupsCount);
        map[primaryProfId].coursesCount += d.groupsCount;
      }
      if (map[d.coProfId]) {
        map[d.coProfId].units += (labUnits * d.groupsCount);
        map[d.coProfId].coursesCount += d.groupsCount;
      }
    } else if (map[primaryProfId]) {
      map[primaryProfId].units += (d.units * d.groupsCount);
      map[primaryProfId].coursesCount += d.groupsCount;
    }
  });

  return map;
}

/**
 * وضعیت واقعی اعلام درٔ دسترس بودن در یک اسلات (از professor_availabilities).
 * بازهٔ استاد باید شروع اسلات را بپوشاند: startTime <= slot.start و endTime > slot.start.
 * روز هفته در دیتابیس ۱‌پایه است (شنبه=۱)، شاخص آرایه ۰‌پایه.
 */
export function slotAvailStatus(
  rows: SchedulingWorkspace['availabilities'],
  profId: number,
  dayIdx: number,
  slot: Pick<TimeSlot, 'startTime'>,
): 'PREF' | 'AVAIL' | 'NONE' {
  const mine = rows.filter(r =>
    r.staffId === profId && r.dayOfWeek === dayIdx + 1 &&
    r.startTime != null && r.endTime != null &&
    r.startTime <= slot.startTime && r.endTime > slot.startTime
  );
  if (!mine.length) return 'NONE';
  return mine.some(r => r.status === 'PREF') ? 'PREF' : 'AVAIL';
}

/** فیلتر زمینه‌دار (رشته / ورودی / نمای هفته) — یکجا برای جدول‌ها و ماتریس */
export function filterScenarioOfferings(
  offerings: DepartmentOffering[],
  ctx: { programId: number; cohortId: string; weekFilter: WeekView },
): DepartmentOffering[] {
  let list = offerings;
  if (ctx.programId > 0) list = list.filter(o => o.programId === 0 || o.programId === ctx.programId);
  if (ctx.cohortId !== 'ALL') list = list.filter(o => o.cohortId === 'ALL' || o.cohortId === ctx.cohortId);
  if (ctx.weekFilter !== 'ALL_VIEW') {
    list = list.filter(o => o.classSchedules.some(cs => cs.weekType === 'ALL' || cs.weekType === ctx.weekFilter));
  }
  return list;
}

export function filterContextDemands(
  demands: CourseDemand[],
  ctx: { programId: number; cohortId: string },
): CourseDemand[] {
  let list = demands;
  if (ctx.programId > 0) list = list.filter(d => d.programId === 0 || d.programId === ctx.programId);
  if (ctx.cohortId !== 'ALL') list = list.filter(d => d.cohortId === 'ALL' || d.cohortId === ctx.cohortId);
  return list;
}

/** آمار پنل بازرس استاد: مجموع واحد، گروه‌ها، روزهای در‌گیر و درصد سهمیه */
export function inspectorSummary(offeringList: DepartmentOffering[], maxWeeklyUnits: number) {
  const totalUnits = offeringList.reduce((sum, o) => sum + o.units, 0);
  const distinctDays = new Set(offeringList.flatMap(o => o.classSchedules.map(cs => cs.dayOfWeek))).size;
  const distinctPrograms = Array.from(new Set(offeringList.map(o => o.programTitle)));
  return {
    totalUnits,
    groupsCount: offeringList.length,
    distinctDays,
    distinctPrograms,
    // سقف تنظیم‌نشده (۰) هرگز NaN تولید نمی‌کند
    quotaPercent: maxWeeklyUnits > 0 ? Math.min(100, Math.round((totalUnits / maxWeeklyUnits) * 100)) : 0,
  };
}

/** شمارهٔ گروه بعدی برای «تأمین از پیشنهاد موتور» = بیشینهٔ موجود + ۱ */
export function nextGroupNumber(existingGroups: number[]): number {
  return (existingGroups.length ? Math.max(...existingGroups) : 0) + 1;
}

/** سهم تئوری/عملی درس مشترک — همیشه داخل بازهٔ ۱۰..۹۰٪ و مکملِ دقیق */
export function coTeachingWeights(theoryPercent: number): { theory: number; lab: number } {
  const theory = Math.max(0.1, Math.min(0.9, theoryPercent / 100));
  return { theory, lab: Math.round((1 - theory) * 100) / 100 };
}

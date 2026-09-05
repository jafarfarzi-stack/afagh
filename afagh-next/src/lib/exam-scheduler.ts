/**
 * ═══════════════════════════════════════════════════════════════════════
 * فاز ۹ — هستهٔ خالص برنامه‌ریزی امتحانات (پاسخ به «طراحی سامانهٔ جامع آموزشی»)
 * ───────────────────────────────────────────────────────────────────────
 * این فایل خالص (بدون DB/Next) است تا همهٔ قواعد قابل تست باشند:
 *   ① زون‌بندی تقویم (Zoning): ارشد = کل ۳ هفته؛ دروس عمومی/مشترک = هفتهٔ اول؛
 *      دروس تخصصی کاردانی/کارشناسی = هفتهٔ دوم و سوم.
 *   ② تشخیص تداخل: HARD = همان روز و ساعت هم‌پوشان (ممنوع قطعی)؛
 *      SOFT = همان روز و ساعت متفاوت (هشدار + تأییدیهٔ دیجیتال).
 *   ③ ظرفیت امتحانی: مجموع صندلی‌های سالن‌های امتحانی در برابر تقاضا؛
 *      روی سرریز، پیشنهاد «تجزیه و شیفت‌بندی» می‌دهد.
 *   ④ امتیازدهی هوشمند زمان: شیفت عصر برای ارشد/رشته‌های شاغل‌محور + ظرفیت.
 *   ⑤ تخصیص صندلی: greedy حداکثر ظرفیت + blockKey برای مراقب هر بلوک.
 * هیچ عدد/متن ثابتی از UI به این‌جا نمی‌رسد؛ همه‌چیز پارامتر ورودی است.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────── ① زون‌بندی تقویم ───────────────────────────

/** مقطع درس: کاردانی/کارشناسی در برابر تحصیلات تکمیلی (ارشد/دکتری) */
export type CourseExamLevel = 'UNDERGRADUATE' | 'POSTGRADUATE';

/** ماهیت درس: عمومی/مشترک (خدماتی) در برابر تخصصی */
export type CourseExamKind = 'GENERAL_SHARED' | 'SPECIALIZED';

/** بازه‌های تقویم امتحانات یک ترم — تاریخ «شمسی» 'YYYY/MM/DD' (هم‌قول با class_sessions) */
export interface ExamZoning {
  /** بازهٔ کل امتحانات (۳ هفته — برای ارشد) */
  globalStart: string;
  globalEnd: string;
  /** هفتهٔ اول — دروس عمومی/مشترک */
  generalStart: string;
  generalEnd: string;
  /** هفتهٔ دوم و سوم — دروس تخصصی */
  specializedStart: string;
  specializedEnd: string;
}

/** مقطع از عنوان مقطع (degree_level_configs.title) */
export function examLevelOf(degreeTitle: string | null | undefined): CourseExamLevel {
  const t = degreeTitle ?? '';
  return t.includes('ارشد') || t.includes('دکتری') || t.includes('تکمیلی') ? 'POSTGRADUATE' : 'UNDERGRADUATE';
}

/** ماهیت درس از courseType (گروه‌های خدماتی: معارف/زبان/علوم پایه/عمومی) */
export function examKindOf(courseType: string | null | undefined): CourseExamKind {
  const t = (courseType ?? '').trim().toLowerCase();
  if (['عمومی', 'general', 'omomi', 'پایه', 'پایه‌ی', 'معارف', 'زبان'].some(k => t.includes(k))) {
    return 'GENERAL_SHARED';
  }
  return 'SPECIALIZED';
}

/** قانون زون‌بندی (قوانین ۱ تا ۳ سند) → بازهٔ مجاز + پیام فارسی */
export function allowedExamRange(
  z: ExamZoning,
  level: CourseExamLevel,
  kind: CourseExamKind,
): { allowed: boolean; allowedStart: string; allowedEnd: string; message: string } {
  // قانون ۱: دانشجویان ارشد/تکمیلی — دسترسی به کل ۳ هفته
  if (level === 'POSTGRADUATE') {
    return {
      allowed: true,
      allowedStart: z.globalStart,
      allowedEnd: z.globalEnd,
      message: 'درس مقطع ارشد/تکمیلی می‌تواند در کل بازهٔ ۳ هفته‌ای امتحانات برنامه‌ریزی شود.',
    };
  }
  // قانون ۲: دروس عمومی و مشترک — فقط هفتهٔ اول
  if (kind === 'GENERAL_SHARED') {
    return {
      allowed: true,
      allowedStart: z.generalStart,
      allowedEnd: z.generalEnd,
      message: 'برنامه‌ریزی دروس عمومی/مشترک فقط در هفتهٔ اول امتحانات مجاز است.',
    };
  }
  // قانون ۳: دروس تخصصی کاردانی/کارشناسی — هفتهٔ دوم و سوم
  return {
    allowed: true,
    allowedStart: z.specializedStart,
    allowedEnd: z.specializedEnd,
    message: 'برنامه‌ریزی دروس تخصصی پایه و کارشناسی فقط در هفتهٔ دوم و سوم مجاز است.',
  };
}

/** تاریخ شمسی 'YYYY/MM/DD' استاندارد (طول ثابت برای مقایسهٔ رشته‌ای) */
export function normJalali(s: string): string {
  const [y, m, d] = s.trim().split('/');
  const p = (n: string) => String(Number(n)).padStart(2, '0');
  return `${String(Number(y)).padStart(4, '0')}/${p(m)}/${p(d)}`;
}

/** آیا تاریخ در بازهٔ مجاز این ردیف است؟ (مقایسهٔ رشته‌ای = مقایسهٔ زمانی برای قالب ثابت) */
export function slotAllowedInZone(z: ExamZoning, level: CourseExamLevel, kind: CourseExamKind, date: string): boolean {
  const d = normJalali(date);
  const r = allowedExamRange(z, level, kind);
  if (!r.allowed) return false;
  return d >= normJalali(r.allowedStart) && d <= normJalali(r.allowedEnd);
}

/** اعتبارسنجی ترتیب بازه‌ها (برای ذخیرهٔ تنظیمات) */
export function validateZoning(z: ExamZoning): { ok: boolean; error?: string } {
  const n = (s: string) => normJalali(s);
  const chain: [string, string, string][] = [
    ['start کل', z.globalStart, z.generalStart],
    ['عمومی', z.generalStart, z.specializedStart],
    ['تخصصی', z.specializedStart, z.globalEnd],
  ];
  for (const [name, a, b] of chain) {
    if (n(a) > n(b)) return { ok: false, error: `ترتیب بازهٔ «${name}» نامعتبر است (${a} پس از ${b}).` };
  }
  return { ok: true };
}

// ─────────────────────────── ② تشخیص تداخل ───────────────────────────

export interface ExamSlotRow {
  offeringId: number;
  courseCode: string;
  /** 'YYYY/MM/DD' */
  examDate: string;
  startTime: string;
  endTime: string;
}

export interface ExamConflictPair {
  a: number;
  b: number;
  courseA: string;
  courseB: string;
  examDate: string;
  message: string;
}

export function detectExamConflicts(rows: ExamSlotRow[]): { hard: ExamConflictPair[]; soft: ExamConflictPair[] } {
  const hard: ExamConflictPair[] = [];
  const soft: ExamConflictPair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (!a.examDate || !b.examDate || a.examDate !== b.examDate) continue;
      const aS = a.startTime.slice(0, 5), aE = a.endTime.slice(0, 5);
      const bS = b.startTime.slice(0, 5), bE = b.endTime.slice(0, 5);
      const overlap = aS < bE && bS < aE;
      if (overlap) {
        hard.push({
          a: a.offeringId, b: b.offeringId, courseA: a.courseCode, courseB: b.courseCode, examDate: a.examDate,
          message: `تداخل قطعی: «${a.courseCode}» و «${b.courseCode}» در ${a.examDate} ساعت ${aS}–${aE} هم‌زمان‌اند.`,
        });
      } else {
        soft.push({
          a: a.offeringId, b: b.offeringId, courseA: a.courseCode, courseB: b.courseCode, examDate: a.examDate,
          message: `تداخل نرم: «${a.courseCode}» و «${b.courseCode}» هر دو در ${a.examDate} امتحان دارند (${aS} و ${bS}).`,
        });
      }
    }
  }
  return { hard, soft };
}

/** آیا ساعت شروع «بعدازظهر» است؟ (برای امتیازدهی شیفت عصر) */
export function isAfternoonSlot(startTime: string): boolean {
  return startTime.slice(0, 5) >= '13:00';
}

// ─────────────────────────── ③ ظرفیت و تجزیهٔ امتحان ───────────────────────────

export type SplitVerdict =
  | { status: 'OK' }
  | {
      status: 'OVERFLOW';
      message: string;
      splitOptions: { label: string; shifts: number; seatsPerShift: number }[];
    };

/**
 * گلوگاه ظرفیت: اگر تقاضا از صندلی‌های خالی بیشتر بود، سیستم به‌جای رد کردن،
 * «تجزیهٔ امتحان» به چند شیفت با ظرفیت قابل قبول پیشنهاد می‌دهد.
 */
export function validateAndSplitExam(totalStudents: number, availableSeats: number): SplitVerdict {
  if (totalStudents <= availableSeats) return { status: 'OK' };
  const splitOptions: { label: string; shifts: number; seatsPerShift: number }[] = [];
  for (let shifts = 2; shifts <= 4; shifts++) {
    const perShift = Math.ceil(totalStudents / shifts);
    if (perShift <= availableSeats) {
      splitOptions.push({
        label: `تجزیه به ${shifts} شیفت (هر شیفت ${perShift} نفر)`,
        shifts,
        seatsPerShift: perShift,
      });
    }
  }
  return {
    status: 'OVERFLOW',
    message: `سؤال: ظرفیت صندلی امتحانی (${availableSeats}) برای ${totalStudents} دانشجو کافی نیست؛ باید امتحان را شیفت‌بندی کنید.`,
    splitOptions,
  };
}

// ─────────────────────────── ④ امتیازدهی هوشمند زمان ───────────────────────────

export interface SlotScoreInput {
  level: CourseExamLevel;
  isAfternoon: boolean;
  /** رشتهٔ دارای دانشجوی شاغلِ زیاد (isWorkingClassMajority) */
  isWorkingClassMajority: boolean;
  /** ظرفیت خالی کافی است؟ (نه → پیشنهاد حذف) */
  hasEnoughCapacity: boolean;
}

export interface SlotScore {
  ok: boolean;
  score: number;
  reasons: string[];
}

/**
 * امتیاز هر (تاریخ، شیفت) — قوانین طلایی سند:
 *   ارشدها/شاغل‌ها → شیفت عصر (ذخیرهٔ انرژی صبح برای کار)
 *   ظرفیت ناکافی → از پیشنهادها حذف (نه امتیاز منفی ساده)
 */
export function scoreExamSlot(px: SlotScoreInput): SlotScore {
  let score = 0;
  const reasons: string[] = [];
  if (!px.hasEnoughCapacity) {
    return { ok: false, score: 0, reasons: ['ظرفیت صندلی در این شیفت کافی نیست.'] };
  }
  if (px.isAfternoon) {
    if (px.level === 'POSTGRADUATE') { score += 50; reasons.push('🌙 شیفت عصر ویژهٔ ارشد'); }
    if (px.isWorkingClassMajority) { score += 40; reasons.push('🧑‍💼 شیفت عصر برای رشتهٔ دارای دانشجوی شاغل'); }
    if (px.level === 'POSTGRADUATE' && px.isWorkingClassMajority) reasons.push('کمترین فشار بر دانشجو');
  }
  if (score === 0) reasons.push('✅ ظرفیت کافی و بدون اولویت عصر');
  return { ok: true, score, reasons };
}

// ─────────────────────────── ⑤ تخصیص صندلی (روز امتحان) ───────────────────────────

export interface SeatAllocEntry {
  enrollmentId: number;
  studentId: number;
  offeringId: number;
}

export interface SeatHall {
  id: number;
  capacity: number;
}

export interface SeatPlan {
  enrollmentId: number;
  hallId: number;
  seatNumber: number;
  /** بلوک مراقبتی: هر ۳۰ صندلی یک بلوک (برای مراقب/کارت ورود) */
  blockKey: string;
}

/**
 * تخصیص قطعی (deterministic) صندلی: دانشجوها بر اساس studentId مرتب،
 * سالن‌ها از بزرگ‌ترین ظرفیت، شمارهٔ صندلی متوالی، بلوک هر ۳۰ صندلی.
 */
export function planSeatAllocation(entries: SeatAllocEntry[], halls: SeatHall[]): SeatPlan[] {
  const sorted = [...entries].sort((a, b) => a.studentId - b.studentId || a.enrollmentId - b.enrollmentId);
  const hallsSorted = [...halls].sort((a, b) => b.capacity - a.capacity);
  const out: SeatPlan[] = [];
  const counters = new Map<number, number>(); // hallId → next seat
  for (const e of sorted) {
    let placed = false;
    for (const h of hallsSorted) {
      const used = counters.get(h.id) ?? 0;
      if (used >= h.capacity) continue;
      const seat = used + 1;
      counters.set(h.id, seat);
      out.push({ enrollmentId: e.enrollmentId, hallId: h.id, seatNumber: seat, blockKey: `${h.id}-B${Math.ceil(seat / 30)}` });
      placed = true;
      break;
    }
    if (!placed) break; // صندلی تمام شد — بقیه بدون تخصیص (کارتابل نشان می‌دهد)
  }
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * هستهٔ خالص موتور برنامه‌ریزی درسی (بدون DB — قابل تست واحد در CI)
 *
 * مسئولیت‌ها: اعتبارسنجی ورودی‌های گروه درسی، تشخیص هم‌پوشانی زمانی،
 * امتیازدهی پیشنهادها (نزدیکی دانشکده + ترجیح استاد + تناسب ظرفیت)،
 * پیش‌بینی تعداد گروه از تقاضا، ماشین فازها و طبقه‌بندی سلامت برنامه.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────── ثابت‌ها و انواع ───────────────────────────

export const GENDERS = ['MALE', 'FEMALE', 'MIXED'] as const;
export type ClassGender = (typeof GENDERS)[number];

export const SHIFTS = ['MORNING', 'EVENING'] as const;
export type Shift = (typeof SHIFTS)[number];
/** مرز شیفت‌ها (دقیقه از نیمه‌شب) — صبح تا ۱۲:۰۰، عصر از ۱۳:۳۰ */
export const SHIFT_BOUNDARY = { morningEnd: 12 * 60, eveningStart: 13 * 60 + 30 } as const;

export const OFFERING_SCOPES = ['DEPARTMENTAL', 'GENERAL_SERVICE'] as const;
export type OfferingScope = (typeof OFFERING_SCOPES)[number];

export const LOCATION_TYPES = ['IN_CAMPUS', 'OUT_CAMPUS'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const SCHEDULING_PHASES = ['SUPPLY', 'ALLOCATION', 'REVIEW', 'PUBLISHED'] as const;
export type SchedulingPhase = (typeof SCHEDULING_PHASES)[number];

export const MAX_GROUPS = 20;        // سقف گروه درسی (دروس عمومی تا ۲۰ گروه)
export const MIN_CAPACITY = 5;
export const MAX_CAPACITY = 500;
export const DAYS_PER_WEEK = 6;      // شنبه تا پنجشنبه
export const MINUTES_GRID = 30;      // گرید نیم‌ساعته برای پیشنهادها

export interface GroupDraftInput {
  groupNumber: number;
  capacity: number;
  gender: ClassGender;
  professorId: number;
  classroomId: number;
  dayOfWeek: number;        // 1..6 (شنبه=1)
  startTime: string;        // "HH:MM"
  endTime: string;          // "HH:MM"
}

export interface ValidatedGroupDraft extends GroupDraftInput {
  startMinutes: number;
  endMinutes: number;
  shift: Shift;
}

// ─────────────────────────── ابزار زمان ───────────────────────────

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) throw new Error('قالب ساعت نامعتبر است.');
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error('قالب ساعت نامعتبر است.');
  return h * 60 + min;
}

export function shiftOf(startMinutes: number, endMinutes: number): Shift {
  if (endMinutes <= SHIFT_BOUNDARY.morningEnd) return 'MORNING';
  if (startMinutes >= SHIFT_BOUNDARY.eveningStart) return 'EVENING';
  // بازه‌ای که از مرز شیفت رد می‌شود → اعتبارسنجی آن را رد می‌کند
  throw new Error('بازهٔ زمانی نباید از مرز شیفت‌ها عبور کند (صبح تا ۱۲:۰۰ — عصر از ۱۳:۳۰).');
}

/** هم‌پوشانی دو بازه (دقیقه): تداخل اگر aStart < bEnd و bStart < aEnd */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ─────────────────────────── اعتبارسنجی ───────────────────────────

/**
 * اعتبارسنجی لیست گروه‌های درسی + نرمال‌سازی (شمارهٔ ترتیبی، شیفت، دقیقه).
 * هر ورودی نامعتبر → throw با پیام فارسی (دفاع سرور، مستقل از UI).
 */
export function validateGroupDrafts(inputs: GroupDraftInput[], ownerIsServicePool: boolean): ValidatedGroupDraft[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('هیچ گروه درسی برای برنامه‌ریزی ارسال نشده است.');
  }
  if (inputs.length > MAX_GROUPS) {
    throw new Error(`تعداد گروه‌های درسی از سقف ${MAX_GROUPS} بیشتر است.`);
  }
  const out: ValidatedGroupDraft[] = [];
  const seen = new Set<number>();
  for (const raw of inputs) {
    if (!raw || typeof raw !== 'object') throw new Error('ردیف گروه درسی نامعتبر است.');
    const g = Number(raw.groupNumber);
    if (!Number.isInteger(g) || g < 1 || g > MAX_GROUPS) throw new Error('شمارهٔ گروه نامعتبر است.');
    if (seen.has(g)) throw new Error(`شمارهٔ گروه ${g} تکراری است.`);
    seen.add(g);

    const cap = Number(raw.capacity);
    if (!Number.isInteger(cap) || cap < MIN_CAPACITY || cap > MAX_CAPACITY) {
      throw new Error(`ظرفیت گروه ${g} نامعتبر است (${MIN_CAPACITY}..${MAX_CAPACITY}).`);
    }
    if (!GENDERS.includes(raw.gender)) throw new Error(`جنسیت گروه ${g} نامعتبر است.`);
    const pid = Number(raw.professorId);
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`استاد گروه ${g} نامعتبر است.`);
    const rid = Number(raw.classroomId);
    if (!Number.isInteger(rid) || rid <= 0) throw new Error(`کلاس فیزیکی گروه ${g} نامعتبر است.`);
    const day = Number(raw.dayOfWeek);
    if (!Number.isInteger(day) || day < 1 || day > DAYS_PER_WEEK) throw new Error(`روز گروه ${g} نامعتبر است.`);

    const start = toMinutes(raw.startTime);
    const end = toMinutes(raw.endTime);
    if (start >= end) throw new Error(`بازهٔ زمانی گروه ${g} نامعتبر است (پایان قبل از شروع).`);
    if (end - start > 4 * 60) throw new Error(`مدت جلسهٔ گروه ${g} نباید از ۴ ساعت بیشتر شود.`);

    // قواعد شیفت: کارگاه‌های خارج دانشگاه یکپارچه در یک شیفت می‌مانند
    let shift: Shift;
    try {
      shift = shiftOf(start, end);
    } catch (e) {
      throw new Error(`گروه ${g}: ${(e as Error).message}`);
    }
    if (ownerIsServicePool && shift !== 'MORNING' && shift !== 'EVENING') {
      throw new Error(`گروه ${g}: شیفت نامعتبر.`);
    }
    out.push({ ...raw, groupNumber: g, capacity: cap, professorId: pid, classroomId: rid, dayOfWeek: day, startMinutes: start, endMinutes: end, shift });
  }
  // مرتب‌سازی صعودی شمارهٔ گروه (ثبات خروجی برای تزریق)
  return out.sort((a, b) => a.groupNumber - b.groupNumber);
}

// ─────────────────────────── امتیازدهی پیشنهادها ───────────────────────────

export const SCORE = {
  sameFaculty: 40,      // کلاس داخل دانشکدهٔ هدف (بدون جابجایی)
  crossFaculty: 10,     // فاصلهٔ بین‌دانشکده‌ای
  preferredTime: 50,    // داخل بازهٔ حضورِ ترجیحی استاد
  okTime: 20,           // خارج بازهٔ ترجیحی ولی داخل ساعات حضور
  capacityPerfect: 30,  // مازاد ظرفیت ۰..۱۵ نفر
  capacityGood: 10,     // مازاد ۱۶..۴۰ نفر
  capacityOver: -60,    // ظرفیت کلاس کمتر از نیاز (هرگز پیشنهاد نمی‌شود)
  gapAllowed: 40,       // مازاد بی‌معنا (بیش از ۴۰ نفر) → ۰
} as const;

export interface SlotScoreInput {
  roomFacultyId: number | null;
  targetFacultyId: number | null;
  inPreferredWindow: boolean;
  inAvailableWindow: boolean;
  roomCapacity: number;
  requiredCapacity: number;
}

export function calculateSlotScore(p: SlotScoreInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // الزام سخت: ظرفیت فیزیکی کافی باشد
  if (p.roomCapacity < p.requiredCapacity) {
    return { score: SCORE.capacityOver, reasons: [`ظرفیت کلاس (${p.roomCapacity}) کمتر از نیاز (${p.requiredCapacity}) است.`] };
  }
  if (!p.inAvailableWindow) {
    return { score: -100, reasons: ['خارج از ساعات حضور استاد است.'] };
  }

  // فاکتور ۱: نزدیکی مکانی به دانشکدهٔ هدف (زونینگ)
  if (p.targetFacultyId && p.roomFacultyId === p.targetFacultyId) {
    score += SCORE.sameFaculty;
    reasons.push('داخل دانشکدهٔ هدف (بدون جابجایی)');
  } else {
    score += SCORE.crossFaculty;
    reasons.push(p.targetFacultyId ? 'فاصلهٔ بین‌دانشکده‌ای' : 'دانشکدهٔ هدف مشخص نشده');
  }

  // فاکتور ۲: ترجیح زمانی استاد
  if (p.inPreferredWindow) {
    score += SCORE.preferredTime;
    reasons.push('زمان ترجیحی استاد');
  } else {
    score += SCORE.okTime;
    reasons.push('زمان مقدور (داخل ساعات حضور)');
  }

  // فاکتور ۳: تناسب ظرفیت کلاس
  const diff = p.roomCapacity - p.requiredCapacity;
  if (diff >= 0 && diff <= 15) {
    score += SCORE.capacityPerfect;
    reasons.push('تناسب عالی ظرفیت');
  } else if (diff <= 40) {
    score += SCORE.capacityGood;
    reasons.push('تناسب قابل قبول ظرفیت');
  }

  return { score, reasons };
}

// ─────────────────────────── پیش‌بینی تقاضا ───────────────────────────

/** تعداد گروه پیشنهادی از روی متقاضیان واقعی (سقف ۲۰ گروه) */
export function suggestedGroupCount(eligibleStudents: number, standardCapacity: number): number {
  if (!Number.isFinite(eligibleStudents) || eligibleStudents < 0) throw new Error('تعداد متقاضی نامعتبر است.');
  const cap = Number(standardCapacity);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('ظرفیت استاندارد نامعتبر است.');
  if (eligibleStudents === 0) return 1; // حداقل یک گروه (حفظ درس در چارت)
  return Math.min(MAX_GROUPS, Math.max(1, Math.ceil(eligibleStudents / cap)));
}

/** توزیع سهمیهٔ گروه‌ها بین دانشکده‌ها بر اساس جمعیت متقاضی (برای زونینگ) */
export function distributeGroupsByFaculty(
  perFaculty: { facultyId: number | null; eligible: number }[],
  standardCapacity: number,
): { facultyId: number | null; eligible: number; groups: number }[] {
  return perFaculty
    .map(f => ({ ...f, groups: suggestedGroupCount(f.eligible, standardCapacity) }))
    .sort((a, b) => b.eligible - a.eligible);
}

// ─────────────────────────── سهمیهٔ کلاس‌ها (فاز ۱) ───────────────────────────

export interface RoomGrantInput {
  classroomId: number;
  capacity: number;
  shifts: Shift[];
}
export interface DeptShareInput {
  departmentId: number;
  activeStudents: number;
}

/**
 * تخصیص اولیهٔ سهمیهٔ (سالن، شیفت) به گروه‌های یک دانشکده — نسبت مستقیم با
 * جمعیت دانشجویان فعال هر گروه؛ کلاس‌های بزرگتر (ظرفیت بالاتر) اول به
 * گروه‌های پرجمعیت‌تر داده می‌شود. خروجی: لیست گرنت‌ها (قابل تست بدون DB).
 */
export function allocateQuotaShifts(
  rooms: RoomGrantInput[],
  depts: DeptShareInput[],
): { departmentId: number; classroomId: number; capacity: number; shift: Shift }[] {
  const totalStudents = depts.reduce((s, d) => s + d.activeStudents, 0);
  if (totalStudents <= 0 || rooms.length === 0) return [];
  const slots = rooms.reduce((s, r) => s + r.shifts.length, 0);

  const sortedRooms = [...rooms].sort((a, b) => b.capacity - a.capacity);
  const grants: { departmentId: number; classroomId: number; capacity: number; shift: Shift }[] = [];
  const pool = sortedRooms.flatMap(r => r.shifts.map(shift => ({ classroomId: r.classroomId, capacity: r.capacity, shift })));

  // سهمیهٔ هر گروه = نسبت جمعیت × کل اسلات‌ها (حداقل ۱، حداکثر کل استخر)
  const shares = depts
    .map(d => ({ ...d, quota: Math.max(1, Math.round((d.activeStudents / totalStudents) * slots)) }))
    .sort((a, b) => b.activeStudents - a.activeStudents);

  let cursor = 0;
  for (const d of shares) {
    for (let i = 0; i < d.quota && cursor < pool.length; i++) {
      const slot = pool[cursor++];
      grants.push({ departmentId: d.departmentId, classroomId: slot.classroomId, capacity: slot.capacity, shift: slot.shift });
    }
  }
  return grants;
}

// ─────────────────────────── ماشین فازها ───────────────────────────

const PHASE_ORDER: Record<SchedulingPhase, number> = { SUPPLY: 0, ALLOCATION: 1, REVIEW: 2, PUBLISHED: 3 };

export function canTransition(from: SchedulingPhase, to: SchedulingPhase): boolean {
  return PHASE_ORDER[to] === PHASE_ORDER[from] + 1;
}

/** آیا ویرایش برنامه در این فاز مجاز است؟ (هرگز در PUBLISHED) */
export function canEditInPhase(phase: SchedulingPhase): boolean {
  return phase === 'SUPPLY' || phase === 'ALLOCATION' || phase === 'REVIEW';
}

/** آیا کلاسِ استخر عمومی در این فاز قابل تخصیص است؟ (تأمین ≠ تخصیص) */
export function canAllocateInPhase(phase: SchedulingPhase): boolean {
  return phase === 'ALLOCATION' || phase === 'REVIEW';
}

// ─────────────────────────── سلامت برنامه ───────────────────────────

export const UTILIZATION = { underfilledThreshold: 0.5, fullThreshold: 0.9 } as const;

export type UtilizationClass = 'UNDERFILLED' | 'NORMAL' | 'FULL' | 'OVERBOOKED';

export function classifyUtilization(enrolled: number, capacity: number): UtilizationClass {
  if (capacity <= 0) return 'OVERBOOKED';
  const ratio = enrolled / capacity;
  if (ratio > 1) return 'OVERBOOKED';
  if (ratio >= UTILIZATION.fullThreshold) return 'FULL';
  if (ratio <= UTILIZATION.underfilledThreshold) return 'UNDERFILLED';
  return 'NORMAL';
}

/** بهره‌وری (سالن، شیفت) در مقابل ساعات قابل استفاده */
export function shiftUtilization(usedMinutes: number, shiftMinutes: number): number {
  if (shiftMinutes <= 0) return 0;
  return Math.min(1, usedMinutes / shiftMinutes);
}

// ─────────────────────────────────────────────────────────────────────────
// فاز ۶ — قیود سخت برنامهٔ هفتگی (Hard Constraints) — خالص و تست‌پذیر
// پاسخ به بازبینی (بند ۹): «۰٪ تداخل تضمین‌شده» فقط بعد از اثبات این چک‌هاست.
// این توابع هیچ DB نمی‌خوانند؛ داده از Scheduling Engine تزریق می‌شود.
// ─────────────────────────────────────────────────────────────────────────

/** یک ردیف برنامهٔ هفتگی برای قیود سخت */
export interface ScheduleConflictInput {
  offeringId: number;
  groupNumber: number | null;
  dayOfWeek: number | null;          // 1..6 (شنبه=1) — null = بدون روز (ناقص)
  startTime: string;                 // HH:MM
  endTime: string;
  roomId: number | null;
  requiredCapacity: number;          // ظرفیت کلاس (course_offerings.capacity)
  professorIds: (number | null)[];   // اصلی + استاد دوم (Co-Teaching)
  offeringTitle: string;
}

/** ظرفیت و عنوان سالن — مبنای چک ROOM_CAPACITY */
export interface RoomCapacityInfo {
  id: number;
  capacity: number;
  title: string;
}

export type ScheduleConflictType = 'ROOM_OVERLAP' | 'PROFESSOR_OVERLAP' | 'ROOM_CAPACITY';

export interface ScheduleConflict {
  type: ScheduleConflictType;
  severity: 'ERROR'; // قیود سخت همیشه ERROR اند (مانع انتشار برنامه)
  message: string;
  offeringIds: number[];
}

/**
 * تشخیص تداخل‌های سخت در یک برنامهٔ هفتگی:
 *   • ROOM_OVERLAP       → دو کلاس هم‌زمان در یک سالن
 *   • PROFESSOR_OVERLAP  → تداخل استاد (اصلی یا دوم) بین دو کلاس هم‌زمان
 *   • ROOM_CAPACITY      → ظرفیت کلاس بیشتر از ظرفیت فیزیکی سالن
 * ورودی باید پیش از تبدیل به اعشارِ واحد Toman ساده شده باشد؛ این‌جا فقط
 * مقایسهٔ زمانی با overlaps() موجود انجام می‌شود.
 */
export function detectScheduleConflicts(
  entries: ScheduleConflictInput[],
  rooms: RoomCapacityInfo[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const byRoom = new Map<number | null, ScheduleConflictInput[]>();
  const byProf = new Map<number, ScheduleConflictInput[]>();

  for (const e of entries) {
    if (e.roomId != null) {
      const arr = byRoom.get(e.roomId) ?? [];
      arr.push(e);
      byRoom.set(e.roomId, arr);
    }
    for (const pid of e.professorIds) {
      if (pid == null) continue;
      const arr = byProf.get(pid) ?? [];
      arr.push(e);
      byProf.set(pid, arr);
    }
  }

  const sameDayOverlap = (a: ScheduleConflictInput, b: ScheduleConflictInput) =>
    a.dayOfWeek != null && a.dayOfWeek === b.dayOfWeek &&
    overlaps(toMinutes(a.startTime), toMinutes(a.endTime), toMinutes(b.startTime), toMinutes(b.endTime));

  // ROOM_OVERLAP
  for (const [roomId, list] of byRoom) {
    if (roomId == null) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (sameDayOverlap(list[i], list[j])) {
          conflicts.push({
            type: 'ROOM_OVERLAP',
            severity: 'ERROR',
            message: `سالن ${roomId}: «${list[i].offeringTitle}» و «${list[j].offeringTitle}» هم‌زمان‌اند.`,
            offeringIds: [...new Set([list[i].offeringId, list[j].offeringId])],
          });
        }
      }
    }
  }

  // PROFESSOR_OVERLAP (استاد اصلی یا دوم)
  for (const [profId, list] of byProf) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (sameDayOverlap(list[i], list[j])) {
          conflicts.push({
            type: 'PROFESSOR_OVERLAP',
            severity: 'ERROR',
            message: `استاد ${profId}: تداخل بین «${list[i].offeringTitle}» و «${list[j].offeringTitle}».`,
            offeringIds: [...new Set([list[i].offeringId, list[j].offeringId])],
          });
        }
      }
    }
  }

  // ROOM_CAPACITY
  const roomCap = new Map(rooms.map((r) => [r.id, r]));
  for (const e of entries) {
    const room = e.roomId != null ? roomCap.get(e.roomId) : undefined;
    if (room && e.requiredCapacity > room.capacity) {
      conflicts.push({
        type: 'ROOM_CAPACITY',
        severity: 'ERROR',
        message: `سالن «${room.title}» (ظرفیت ${room.capacity}) برای «${e.offeringTitle}» (${e.requiredCapacity} نفر) کوچک است.`,
        offeringIds: [e.offeringId],
      });
    }
  }

  return conflicts;
}

/** آیا برنامه بدون هیچ قید سخت نقض‌شده است؟ (پیش‌شرط انتشار) */
export function hasHardConflicts(conflicts: ScheduleConflict[]): boolean {
  return conflicts.length > 0;
}

/**
 * تاریخ جلسات یک درس در ترم — خالص، بدون DB.
 * قرارداد: dayOfWeek: 1..6 (شنبه = 1)، termStart تاریخ اولین روز هفتهٔ اول است.
 *   ALL  → ۱۶ جلسهٔ هفتگی
 *   EVEN → هفته‌های زوج (جلسات ۲، ۴، …، ۱۶ — ۸ جلسه)
 *   ODD  → هفته‌های فرد (جلسات ۱، ۳، …، ۱۵ — ۸ جلسه)
 * خروجی: sessionNo (از ۱) + Date میلادی — تبدیل به شمسی در لایهٔ DB انجام می‌شود.
 */
export function sessionDatesFor(
  termStart: Date,
  dayOfWeek: number,
  scheduleType: 'ALL' | 'EVEN' | 'ODD',
  totalSessions = 16
): { sessionNo: number; date: Date }[] {
  if (dayOfWeek < 1 || dayOfWeek > 6) return [];
  const base = new Date(termStart.getTime());
  base.setHours(0, 0, 0, 0);
  const offsetDays = dayOfWeek - 1; // شنبه = 0
  const first = new Date(base.getTime() + offsetDays * 86400000);
  const out: { sessionNo: number; date: Date }[] = [];
  let no = 1;
  for (let w = 0; w < totalSessions; w++) {
    const week = w + 1; // 1-based
    const take = scheduleType === 'ALL' || (scheduleType === 'EVEN' && week % 2 === 0) || (scheduleType === 'ODD' && week % 2 === 1);
    if (take) {
      out.push({ sessionNo: no, date: new Date(first.getTime() + w * 7 * 86400000) });
      no++;
    }
  }
  return out;
}

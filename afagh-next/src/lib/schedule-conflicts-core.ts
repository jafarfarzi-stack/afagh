/**
 * ═══════════════════════════════════════════════════════════════════════
 *  تشخیص «تداخل واقعی» برنامهٔ هفتگی — هستهٔ خالص (بدون DB، بدون fs)
 *
 *  چرا این ماژول جدا است؟
 *  ─────────────────────────────────────────────────────────────────────
 *  در ترم ۱۴۰۵۱ سما، شمارش سادهٔ هم‌پوشانی‌ها ۷۱۶ مورد را نشان می‌داد؛
 *  اما بیشترِ آن‌ها «تداخل» نبودند بلکه **کلاس ادغامی** بودند: چند درسِ
 *  مختلف که واقعاً در یک جلسه و یک سالن برگزار می‌شوند. قاعدهٔ درست را
 *  خودِ مخزن از قبل دارد (`src/lib/professor-calendar-layout.ts`) و اینجا
 *  همان قاعده را — در سطحِ «یک جفت اسلات» — پیاده می‌کنیم تا خروجیِ گزارش
 *  با آنچه استاد در تقویمش می‌بیند یکی باشد:
 *
 *    دو ارائه «ادغامی» (و نه تداخل) هستند اگر
 *      الف) کلید ادغامِ دستیِ یکسان و غیرـSOLO داشته باشند، یا
 *      ب) ساعت شروع و پایان دقیقاً یکی باشد و سالن هم یکی باشد
 *         (سالنِ NULL یعنی «نامشخص» و مانع ادغام نمی‌شود — همان موردی که
 *          در بررسیِ استاد ۱۳۴ دیدیم: ۷ درس سالن داشتند و یکی NULL بود).
 *
 *  «SOLO-n» یعنی کارشناس عمداً کلاس را از ادغام جدا کرده؛ پس اگر هنوز
 *  هم‌پوشانی دارد، واقعاً باید اصلاح شود و نباید پنهان بماند.
 *
 *  این فایل خالص است تا `tests/schedule-conflicts.test.ts` بتواند رفتارش را
 *  زیر `tsx` قفل کند (اسکریپت‌های مخزن نمی‌توانند از `src/*.ts` ایمپورت کنند،
 *  اما تست‌ها می‌توانند).
 * ═══════════════════════════════════════════════════════════════════════
 */

export const DAY_NAMES_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'] as const;

export type ConflictKind = 'PROFESSOR' | 'ROOM';

/** یک ردیفِ برنامهٔ هفتگی (schedules با scheduleType='CLASS') به‌همراه متنِ نمایشی */
export interface ConflictSlot {
  scheduleId: number;
  offeringId: number;
  dayOfWeek: number | null;
  /** فرمت «HH:MM» */
  startTime: string;
  endTime: string;
  roomId: number | null;
  roomName: string | null;
  professorId: number | null;
  professorName: string | null;
  courseCode: string;
  courseTitle: string;
  groupNumber: number;
  enrolledCount: number;
  sharedScheduleGroupKey: string | null;
}

/** یک تداخلِ واقعی: دو ارائه که در یک روز هم‌پوشانی دارند و ادغامی هم نیستند */
export interface ConflictPair {
  kind: ConflictKind;
  /** استاد (staff.id) یا سالن (classrooms.id) */
  entityId: number;
  entityName: string;
  dayOfWeek: number;
  dayName: string;
  a: ConflictSlot;
  b: ConflictSlot;
  /** دقیقه‌های هم‌پوشانیِ واقعی (همیشه > ۰) */
  overlapMinutes: number;
  /** بازهٔ اشتراک به‌صورت دقیقه از نیمه‌شب — برای نمایش «ساعت تداخل» */
  overlapFrom: number;
  overlapTo: number;
  /**
   * «احتمالاً یک جلسهٔ ادغامی» — همان استاد، همان سالن، و اختلافِ ساعت در حد
   * چند دقیقه. این پرچم چیزی را پنهان نمی‌کند؛ فقط به کارشناس می‌گوید با یک
   * کلیک می‌تواند کلِ گروه را ادغام کند. (توضیح در `isNearMergedPair`)
   */
  likelyMerged: boolean;
  /** کلید پایدار برای ذخیرهٔ «بررسی شد» — با جابه‌جایی ردیف‌ها عوض نمی‌شود */
  fingerprint: string;
}

/** «HH:MM» → دقیقه از نیمه‌شب؛ مقدارِ بد → null */
export function toMinutes(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** دقیقه → «HH:MM» */
export function minutesToHm(v: number): string {
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** طولِ اشتراکِ دو بازه (دقیقه)؛ ۰ یعنی هیچ هم‌پوشانی */
export function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const from = Math.max(aStart, bStart);
  const to = Math.min(aEnd, bEnd);
  return to > from ? to - from : 0;
}

/** کلید ادغامِ دستیِ معتبر — «SOLO-» یعنی عمداً جدا شده، پس ادغام نیست */
export function sharedMergeKey(v: string | null | undefined): string | null {
  const k = String(v ?? '').trim();
  if (!k) return null;
  if (k.startsWith('SOLO-')) return null;
  return k;
}

/** آیا این ارائه عمداً از ادغام جدا شده است؟ (`SOLO-<id>`) */
export function isExplicitlySplit(v: string | null | undefined): boolean {
  return String(v ?? '').trim().startsWith('SOLO-');
}

/**
 * آیا این دو اسلات «یک جلسهٔ ادغامی» هستند؟ (یعنی تداخل نیستند)
 * جزئیاتِ قاعده در بالای فایل.
 */
export function isMergedPair(a: ConflictSlot, b: ConflictSlot): boolean {
  const ka = sharedMergeKey(a.sharedScheduleGroupKey);
  const kb = sharedMergeKey(b.sharedScheduleGroupKey);
  if (ka && kb && ka === kb) return true;

  // اگر کارشناس یکی را عمداً «جدا» کرده، دیگر ادغامی نیست — حتی اگر ساعت و
  // سالن یکی باشد؛ چون «جدا» یعنی دو کلاسِ مستقل، و دو کلاسِ مستقل در یک
  // سالن و یک ساعت یعنی تصرفِ فیزیکیِ دوگانه که باید اصلاح شود.
  if (isExplicitlySplit(a.sharedScheduleGroupKey) || isExplicitlySplit(b.sharedScheduleGroupKey)) return false;

  const sameTime = a.startTime === b.startTime && a.endTime === b.endTime;
  if (!sameTime) return false;
  // سالنِ تعیین‌نشده (NULL) یعنی «نامشخص»؛ نباید جلوی تشخیصِ ادغام را بگیرد
  if (a.roomId == null || b.roomId == null) return true;
  return Number(a.roomId) === Number(b.roomId);
}

/**
 * تلورانسِ «یک جلسه» — چند دقیقه اختلافِ ساعت در دادهٔ سما طبیعی است.
 *
 * چرا لازم شد: در ۱۴۰۵۱ درسِ ۴۵۱۷۰ در سما ۱۴:۰۰–۱۶:۱۵ ثبت شده بود و چهار
 * درسِ دیگرِ همان استاد ۱۳:۴۵–۱۶:۱۰ — هر پنج درس در یک سالن و یک جلسه. چون
 * قاعدهٔ سخت‌گیرانه «ساعتِ دقیقاً یکسان» را می‌خواست، آن یک درس از ادغام جا
 * ماند و چهار تداخلِ جدا تولید کرد. با این تلورانس، «یک جلسه» شناخته می‌شود
 * ولی **به‌صورت پیشنهاد**، نه حذفِ خودکار.
 */
export const NEAR_SESSION_TOLERANCE_MIN = 20;

/**
 * آیا این دو اسلات «به‌احتمالِ زیاد یک جلسه» هستند؟ (پیشنهادِ ادغام، نه حکم)
 *
 * شرط‌ها: همان استاد، همان سالن (سالنِ NULL مانع نیست)، و اختلافِ ساعتِ شروع
 * و پایان هر دو در حدِ تلورانس. اگر سالن‌ها متفاوت باشند، ادغام نیست — یک
 * استاد در دو کلاسِ فیزیکیِ مختلف یعنی تصرفِ دوگانه که باید بررسی شود.
 */
export function isNearMergedPair(a: ConflictSlot, b: ConflictSlot): boolean {
  if (isExplicitlySplit(a.sharedScheduleGroupKey) || isExplicitlySplit(b.sharedScheduleGroupKey)) return false;
  // یک جلسهٔ ادغامی یک استاد دارد؛ دو استادِ متفاوت یعنی دو کلاس.
  if (a.professorId == null || b.professorId == null) return false;
  if (Number(a.professorId) !== Number(b.professorId)) return false;
  if (isMergedPair(a, b)) return true;
  if (a.roomId != null && b.roomId != null && Number(a.roomId) !== Number(b.roomId)) return false;

  const aS = toMinutes(a.startTime);
  const aE = toMinutes(a.endTime);
  const bS = toMinutes(b.startTime);
  const bE = toMinutes(b.endTime);
  if (aS == null || aE == null || bS == null || bE == null) return false;

  return (
    Math.abs(aS - bS) <= NEAR_SESSION_TOLERANCE_MIN && Math.abs(aE - bE) <= NEAR_SESSION_TOLERANCE_MIN
  );
}

/** اثرانگشتِ پایدارِ یک تداخل — مبنای ذخیرهٔ «بررسی شد» */export function conflictFingerprint(
  kind: ConflictKind,
  entityId: number,
  dayOfWeek: number,
  aScheduleId: number,
  bScheduleId: number,
): string {
  const lo = Math.min(Number(aScheduleId), Number(bScheduleId));
  const hi = Math.max(Number(aScheduleId), Number(bScheduleId));
  return `${kind}:${entityId}:${dayOfWeek}:${lo}:${hi}`;
}

export interface ConflictScanResult {
  pairs: ConflictPair[];
  /** تعداد جفت‌هایی که هم‌پوشانی داشتند و استاد یا سالنِ مشترک داشتند (قبل از فیلتر ادغام) */
  rawOverlaps: number;
  /** تعداد جفت‌هایی که به‌دلیل «ادغامی بودن» از فهرست حذف شدند */
  mergedSkipped: number;
  /** تعداد اسلات‌های یکتایی که واقعاً بررسی شد */
  slotsScanned: number;
  /** چند ردیفِ برنامه تکراری بود و یک‌بار شمرده شد */
  duplicateSlots: number;
}

/**
 * حذفِ ردیف‌های تکراریِ برنامه.
 *
 * چرا لازم شد: در ترم ۱۴۰۵۱، ۱۱۴ ارائه ردیفِ CLASS کاملاً یکسان (همان روز،
 * ساعت و سالن) دو تا چهار بار داشتند — ۲۲۹ ردیفِ اضافه. بدون این پاک‌سازی،
 * هر تداخل به‌جای یک‌بار سه‌چهار بار در گزارش می‌آمد و کارشناس فکر می‌کرد
 * برنامه سه برابر خراب‌تر از واقعیت است. (خودِ ردیفِ تکراری یک نقصِ دادهٔ
 * جداست، ولی گزارشِ تداخل نباید آن را چند برابر نشان دهد.)
 *
 * کلیدِ یکتایی سالن را هم شامل می‌شود: دو ردیف با ساعت یکسان و سالنِ متفاوت
 * «تکراری» نیستند، دو ادعای متفاوت‌اند و باید دیده شوند.
 */
export function dedupeSlots(slots: readonly ConflictSlot[]): { slots: ConflictSlot[]; removed: number } {
  const seen = new Set<string>();
  const out: ConflictSlot[] = [];
  for (const s of slots) {
    if (s == null) continue;
    const key = [
      s.offeringId,
      s.dayOfWeek ?? 'n',
      s.startTime,
      s.endTime,
      s.roomId ?? 'n',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return { slots: out, removed: slots.length - out.length };
}

/**
 * اسکنِ کاملِ یک ترم: خروجی فقط تداخل‌های واقعی است.
 *
 * ترتیبِ خروجی: نوع (استاد پیش از سالن)، سپس موجودیت، روز، ساعت شروع —
 * تا کارشناس بتواند از بالا پایین، استادبه‌استاد پیش برود.
 */
export function detectScheduleConflicts(rawSlots: readonly ConflictSlot[]): ConflictScanResult {
  const deduped = dedupeSlots(rawSlots);
  const slots = deduped.slots;
  const pairs: ConflictPair[] = [];
  let mergedSkipped = 0;
  let rawOverlaps = 0;

  const byDay = new Map<number, ConflictSlot[]>();
  for (const s of slots) {
    const d = Number(s.dayOfWeek);
    if (!Number.isInteger(d) || d < 0 || d > 6) continue;
    const list = byDay.get(d) ?? [];
    list.push(s);
    byDay.set(d, list);
  }

  for (const [day, list] of byDay) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        // دو اسلاتِ یک ارائه (برنامهٔ دوجلسه‌ایِ یک درس) تداخلِ گزارش‌کردنی نیست
        if (Number(a.offeringId) === Number(b.offeringId)) continue;

        // اول ارزان‌ترین شرط: بدون استاد یا سالنِ مشترک، هر هم‌پوشانی‌ای بی‌ربط است
        const sameProfessor =
          a.professorId != null && b.professorId != null && Number(a.professorId) === Number(b.professorId);
        const sameRoom = a.roomId != null && b.roomId != null && Number(a.roomId) === Number(b.roomId);
        if (!sameProfessor && !sameRoom) continue;

        const aS = toMinutes(a.startTime);
        const aE = toMinutes(a.endTime);
        const bS = toMinutes(b.startTime);
        const bE = toMinutes(b.endTime);
        if (aS == null || aE == null || bS == null || bE == null) continue;
        if (aE <= aS || bE <= bS) continue; // بازهٔ معکوس/تهی — دادهٔ خراب

        const ov = overlapMinutes(aS, aE, bS, bE);
        if (ov <= 0) continue;
        rawOverlaps++;

        const merged = isMergedPair(a, b);

        /**
         * ادغام، تداخلِ استاد را حل می‌کند ولی تداخلِ سالن را نه.
         *
         * یک جلسهٔ ادغامی یک استاد دارد. اگر دو استادِ متفاوت در یک سالن و یک
         * ساعت باشند، سالن واقعاً دو بار تصرف شده — این را نباید با بهانهٔ
         * «ادغامی» پنهان کرد. (پیش از این اصلاح، این موارد کلاً از گزارش
         * می‌افتادند و فقط ۷۰ تداخلِ سالن می‌ماند.)
         */
        const differentTeachers =
          a.professorId != null && b.professorId != null && Number(a.professorId) !== Number(b.professorId);

        const professorConflict = sameProfessor && !merged;
        const roomConflict = sameRoom && (!merged || differentTeachers);

        if (!professorConflict && !roomConflict) {
          if (merged) mergedSkipped++;
          continue;
        }

        const push = (kind: ConflictKind, entityId: number, entityName: string) => {
          pairs.push({
            kind,
            entityId,
            entityName,
            dayOfWeek: day,
            dayName: DAY_NAMES_FA[day] ?? `روز ${day}`,
            a,
            b,
            overlapMinutes: ov,
            overlapFrom: Math.max(aS, bS),
            overlapTo: Math.min(aE, bE),
            likelyMerged: isNearMergedPair(a, b),
            fingerprint: conflictFingerprint(kind, entityId, day, a.scheduleId, b.scheduleId),
          });
        };

        if (professorConflict) push('PROFESSOR', Number(a.professorId), a.professorName ?? `استاد ${a.professorId}`);
        if (roomConflict) push('ROOM', Number(a.roomId), a.roomName ?? `کلاس ${a.roomId}`);
      }
    }
  }

  pairs.sort(
    (x, y) =>
      (x.kind === y.kind ? 0 : x.kind === 'PROFESSOR' ? -1 : 1) ||
      x.entityName.localeCompare(y.entityName, 'fa') ||
      x.dayOfWeek - y.dayOfWeek ||
      x.overlapFrom - y.overlapFrom,
  );

  return {
    pairs,
    mergedSkipped,
    rawOverlaps,
    slotsScanned: slots.length,
    duplicateSlots: deduped.removed,
  };
}

export interface ConflictSummary {
  professor: number;
  room: number;
  professorEntities: number;
  roomEntities: number;
  studentsAtRisk: number;
  worstOverlapMinutes: number;
}

/** خلاصهٔ بالای صفحه: چند تداخل، چند استاد/سالن درگیر، بدترین هم‌پوشانی */
export function summarizeConflicts(pairs: readonly ConflictPair[]): ConflictSummary {
  const profs = new Set<number>();
  const rooms = new Set<number>();
  let studentsAtRisk = 0;
  let worst = 0;
  let professor = 0;
  let room = 0;
  const seenPair = new Set<string>();

  for (const p of pairs) {
    if (p.kind === 'PROFESSOR') { professor++; profs.add(p.entityId); }
    else { room++; rooms.add(p.entityId); }
    if (p.overlapMinutes > worst) worst = p.overlapMinutes;
    const key = `${p.a.offeringId}:${p.b.offeringId}`;
    if (!seenPair.has(key)) {
      seenPair.add(key);
      studentsAtRisk += Number(p.a.enrolledCount ?? 0) + Number(p.b.enrolledCount ?? 0);
    }
  }
  return {
    professor,
    room,
    professorEntities: profs.size,
    roomEntities: rooms.size,
    studentsAtRisk,
    worstOverlapMinutes: worst,
  };
}

/** فهرستِ یکتا برای نمایش «کدام استادها / کدام سالن‌ها درگیرند» */
export function groupConflictsByEntity(pairs: readonly ConflictPair[]): {
  kind: ConflictKind;
  entityId: number;
  entityName: string;
  items: ConflictPair[];
}[] {
  const map = new Map<string, { kind: ConflictKind; entityId: number; entityName: string; items: ConflictPair[] }>();
  for (const p of pairs) {
    const key = `${p.kind}:${p.entityId}`;
    const cur = map.get(key) ?? { kind: p.kind, entityId: p.entityId, entityName: p.entityName, items: [] };
    cur.items.push(p);
    map.set(key, cur);
  }
  return [...map.values()].sort(
    (x, y) =>
      (x.kind === y.kind ? 0 : x.kind === 'PROFESSOR' ? -1 : 1) ||
      y.items.length - x.items.length ||
      x.entityName.localeCompare(y.entityName, 'fa'),
  );
}

/**
 * یک «مسئله» — چند جفتِ تداخلِ هم‌زمان که در واقع یک مشکل‌اند.
 *
 * چرا گروه‌بندی لازم شد: گزارشِ جفتی درست است ولی برای کارشناس گمراه‌کننده.
 * اگر استادی پنج درس در بازهٔ ۱۳:۴۵–۱۶:۱۵ داشته باشد، گزارشِ جفتی ۴ ردیف
 * می‌سازد که یک طرفشان تکرار می‌شود و کاربر فکر می‌کند «هر مورد دوبار نشان
 * داده شده»؛ بدتر آنکه همان پنج درس چون سالنِ مشترک هم دارند، ۴ ردیفِ
 * «سالن» هم تولید می‌کنند. در واقع **یک** مسئله است با پنج درسِ درگیر.
 */
export interface ConflictEntity {
  kind: ConflictKind;
  id: number;
  name: string;
}

export interface ConflictGroup {
  /** کلیدِ نمایشیِ پایدار (برای React) */
  key: string;
  /** نوعِ اصلی؛ اگر هم استاد و هم سالن درگیر باشند `MIXED` */
  kind: ConflictKind | 'MIXED';
  /** همهٔ نوع‌های درگیر (برای فیلترِ استاد/سالن) */
  kinds: ConflictKind[];
  /** استاد(ها) و سالن(های) درگیر */
  entities: ConflictEntity[];
  /** نامِ موجودیت‌ها با «،» — برای جست‌وجو و نمایشِ خلاصه */
  entityName: string;
  dayOfWeek: number;
  dayName: string;
  /** اتحادِ بازهٔ همهٔ اسلات‌های درگیر: «از ۱۳:۴۵ تا ۱۶:۱۵» */
  windowFrom: number;
  windowTo: number;
  /** بیشترین هم‌پوشانیِ داخلِ گروه */
  overlapMinutes: number;
  overlapFrom: number;
  overlapTo: number;
  /** همهٔ ارائه‌های درگیر (یکتا، مرتب بر اساس کد درس) */
  slots: ConflictSlot[];
  /** جفت‌های تشکیل‌دهنده — برای ثبتِ «بررسی شد» به‌ازای هر جفت */
  pairs: ConflictPair[];
  /** همهٔ جفت‌ها «احتمالاً یک جلسه»اند ⇒ یک کلیک برای ادغامِ کلِ گروه */
  likelyMerged: boolean;
  /** مجموع دانشجویانِ ارائه‌های یکتا */
  students: number;
  /** همهٔ جفت‌های این گروه قبلاً بررسی شده‌اند */
  reviewed: boolean;
}

/**
 * تبدیلِ جفت‌های تداخل به «مسئله»ها.
 *
 * دو جفت در یک مسئله‌اند اگر روزشان یکی باشد، بازهٔ هم‌پوشانی‌شان با هم
 * **هم‌پوشانیِ مثبت** داشته باشد، و:
 *   • به یک موجودیتِ یکسان اشاره کنند (همان استاد یا همان سالن)، یا
 *   • یک درسِ مشترک داشته باشند (همان پنج درس، یک مسئله).
 *
 * این‌طور «استاد» و «سالنِ» یک جفتِ درس در یک ردیف می‌آیند، نه دو ردیف.
 * بازه‌های فقط لبه‌به‌لبه (۱۰:۰۰ پایان و ۱۰:۰۰ شروع) جدا می‌مانند.
 */
export function groupConflictPairs(
  pairs: readonly ConflictPair[],
  isReviewed?: (p: ConflictPair) => boolean,
): ConflictGroup[] {
  const n = pairs.length;
  if (n === 0) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let i = x;
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (x: number, y: number) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[ry] = rx;
  };

  const windowsOverlap = (p: ConflictPair, q: ConflictPair) =>
    p.overlapFrom < q.overlapTo && q.overlapFrom < p.overlapTo;

  const sharesSlot = (p: ConflictPair, q: ConflictPair) => {
    const pa = Number(p.a.offeringId);
    const pb = Number(p.b.offeringId);
    const qa = Number(q.a.offeringId);
    const qb = Number(q.b.offeringId);
    return pa === qa || pa === qb || pb === qa || pb === qb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = pairs[i];
      const q = pairs[j];
      if (p.dayOfWeek !== q.dayOfWeek) continue;
      if (!windowsOverlap(p, q)) continue;
      const sameEntity = p.kind === q.kind && Number(p.entityId) === Number(q.entityId);
      if (sameEntity || sharesSlot(p, q)) union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = byRoot.get(r) ?? [];
    list.push(i);
    byRoot.set(r, list);
  }

  const out: ConflictGroup[] = [];

  for (const idxs of byRoot.values()) {
    const cluster = idxs.map(i => pairs[i]);

    const slotMap = new Map<number, ConflictSlot>();
    const entityMap = new Map<string, ConflictEntity>();
    for (const p of cluster) {
      slotMap.set(Number(p.a.offeringId), p.a);
      slotMap.set(Number(p.b.offeringId), p.b);
      entityMap.set(`${p.kind}:${p.entityId}`, { kind: p.kind, id: Number(p.entityId), name: p.entityName });
    }

    const slots = [...slotMap.values()].sort(
      (x, y) => x.courseCode.localeCompare(y.courseCode, 'fa', { numeric: true }),
    );
    const entities = [...entityMap.values()].sort(
      (x, y) =>
        (x.kind === y.kind ? 0 : x.kind === 'PROFESSOR' ? -1 : 1) ||
        x.name.localeCompare(y.name, 'fa'),
    );

    let windowFrom = Number.POSITIVE_INFINITY;
    let windowTo = 0;
    let overlapMinutes = 0;
    let overlapFrom = Number.POSITIVE_INFINITY;
    let overlapTo = 0;
    let students = 0;
    for (const s of slots) {
      const st = toMinutes(s.startTime);
      const en = toMinutes(s.endTime);
      if (st != null) windowFrom = Math.min(windowFrom, st);
      if (en != null) windowTo = Math.max(windowTo, en);
      students += Number(s.enrolledCount ?? 0);
    }
    for (const p of cluster) {
      overlapMinutes = Math.max(overlapMinutes, p.overlapMinutes);
      overlapFrom = Math.min(overlapFrom, p.overlapFrom);
      overlapTo = Math.max(overlapTo, p.overlapTo);
    }
    if (!Number.isFinite(windowFrom)) windowFrom = 0;

    const kinds = [...new Set(entities.map(e => e.kind))].sort(
      (x, y) => (x === y ? 0 : x === 'PROFESSOR' ? -1 : 1),
    );
    const first = cluster[0];
    const key = `${first.dayOfWeek}:${overlapFrom}:${overlapTo}:${entities.map(e => `${e.kind[0]}${e.id}`).join('+')}`;

    out.push({
      key,
      kind: kinds.length === 1 ? kinds[0] : 'MIXED',
      kinds,
      entities,
      entityName: entities.map(e => e.name).join('، '),
      dayOfWeek: first.dayOfWeek,
      dayName: first.dayName,
      windowFrom,
      windowTo,
      overlapMinutes,
      overlapFrom,
      overlapTo,
      slots,
      pairs: cluster,
      likelyMerged: cluster.every(p => p.likelyMerged),
      students,
      reviewed: isReviewed ? cluster.every(p => isReviewed(p)) : false,
    });
  }

  out.sort(
    (x, y) =>
      y.slots.length - x.slots.length ||
      (x.kind === y.kind ? 0 : x.kind === 'PROFESSOR' ? -1 : x.kind === 'ROOM' ? 1 : -1) ||
      x.entityName.localeCompare(y.entityName, 'fa') ||
      x.dayOfWeek - y.dayOfWeek ||
      x.overlapFrom - y.overlapFrom,
  );
  return out;
}

/** برچسب‌های فارسیِ دلیلِ «بررسی شد» */
export const CONFLICT_REASON_LABELS: Record<string, string> = {
  MERGED_OK: 'کلاس ادغامی است (یک جلسهٔ واقعی)',
  PROF_OK: 'استاد هماهنگ است (حضور نوبتی/تفکیک جلسه)',
  ROOM_OK: 'سالن اشتراکی/بزرگ — اشکالی ندارد',
  WILL_FIX: 'نیاز به اصلاح برنامه (فعلاً پذیرفته شده)',
  OTHER: 'سایر موارد',
};

export const CONFLICT_REASON_CODES = Object.keys(CONFLICT_REASON_LABELS);

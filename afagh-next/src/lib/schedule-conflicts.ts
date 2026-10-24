/**
 * ═══════════════════════════════════════════════════════════════════════
 *  بارگذاریِ «تداخل‌های واقعی برنامهٔ هفتگی» — لایهٔ سرور (خواندن از DB)
 *
 *  منطقِ تشخیص در `schedule-conflicts-core.ts` است (خالص و تست‌پذیر)؛ اینجا
 *  فقط داده را می‌خواند و به آن هسته می‌سپارد. چرا جدا؟ چون تشخیصِ تداخل
 *  باید بدون دیتابیس هم قابل تست باشد و چون همین منطق بعداً در همگام‌سازیِ
 *  هفتگیِ سما هم به‌کار می‌رود.
 *
 *  نکتهٔ مهمِ گزارش: عددِ «هم‌پوشانیِ خام» را هم برمی‌گردانیم. در ۱۴۰۵۱ این
 *  عدد ۷۱۶ بود و تداخلِ واقعی ۶۹ — بدون نمایشِ تفاوت، کارشناس فکر می‌کند
 *  برنامهٔ درسی فاجعه است، در حالی که بیشترِ موارد کلاس ادغامی‌اند.
 * ═══════════════════════════════════════════════════════════════════════
 */
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  detectScheduleConflicts,
  groupConflictPairs,
  summarizeConflicts,
  type ConflictGroup,
  type ConflictPair,
  type ConflictSlot,
  type ConflictSummary,
} from './schedule-conflicts-core';

export interface ConflictReviewRow {
  fingerprint: string;
  status: string;
  reasonCode: string | null;
  reasonText: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

export interface ScheduleConflictReport {
  termId: number;
  /** تداخل‌های واقعی (ادغامی‌ها حذف شده‌اند) — سطحِ «جفت» */
  pairs: ConflictPair[];
  /**
   * همان تداخل‌ها، گروه‌بندی‌شده در «مسئله» — سطحِ نمایش.
   *
   * یک استاد با ۵ درس در یک بازه، در سطح جفت ۴ ردیف می‌سازد که یک طرفشان
   * تکرار می‌شود (و کاربر فکر می‌کند دوبار نمایش داده شده)؛ در سطح گروه یک
   * ردیف با ۵ درس است.
   */
  groups: ConflictGroup[];
  /** تداخل‌هایی که کارشناس قبلاً بررسی/پذیرفته — کلید: اثرانگشت */
  reviewed: Record<string, ConflictReviewRow>;
  summary: ConflictSummary;
  /** چند جفت اسلات هم‌پوشان بود (قبل از فیلترِ ادغام) */
  rawOverlaps: number;
  /** چند تای آن‌ها ادغامی تشخیص داده شد و حذف شد */
  mergedSkipped: number;
  /** چند ردیف برنامهٔ هفتگی بررسی شد */
  slotsScanned: number;
  /** چند ردیفِ برنامه تکراری بود و یک‌بار شمرده شد */
  duplicateSlots: number;
  /** تعداد جفت‌هایی که کارشناس بررسی کرده (برای نمایش پیشرفت) */
  reviewedCount: number;
  /** تعداد «مسئله»های باز (گروهی که همهٔ جفت‌هایش بررسی نشده) */
  openIssues: number;
  /** تعداد «مسئله»های کل */
  totalIssues: number;
  /** چند مسئله «احتمالاً یک جلسهٔ ادغامی» است و با یک کلیک بسته می‌شود */
  likelyMergedIssues: number;
}

type SlotDbRow = {
  scheduleId: number;
  offeringId: number;
  dayOfWeek: number | null;
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
};

/**
 * خواندنِ برنامهٔ هفتگیِ یک ترم (فقط `scheduleType='CLASS'`؛ امتحان‌ها جدااند)
 * و استخراجِ تداخل‌های واقعی.
 */
export async function loadScheduleConflicts(
  termId: number,
  universityId: number,
): Promise<ScheduleConflictReport> {
  const slotRows = (await db.execute(sql`
    select s.id as "scheduleId", s."offeringId" as "offeringId", s."dayOfWeek" as "dayOfWeek",
           to_char(s."startTime", 'HH24:MI') as "startTime",
           to_char(s."endTime", 'HH24:MI') as "endTime",
           s."roomId" as "roomId", cr.name as "roomName",
           o."professorId" as "professorId",
           nullif(trim(coalesce(u."firstName", '') || ' ' || coalesce(u."lastName", '')), '') as "professorName",
           c.code as "courseCode", c.title as "courseTitle",
           o."groupNumber" as "groupNumber", o."enrolledCount" as "enrolledCount",
           o."sharedScheduleGroupKey" as "sharedScheduleGroupKey"
    from schedules s
    join course_offerings o on o.id = s."offeringId"
    join courses c on c.id = o."courseId"
    left join classrooms cr on cr.id = s."roomId"
    left join staff st on st.id = o."professorId"
    left join users u on u.id = st."userId"
    where o."termId" = ${termId}
      and s."scheduleType" = 'CLASS'
      and s."dayOfWeek" is not null
      and o."isActive" = 1
      and o."universityId" = ${universityId}
  `)).rows as SlotDbRow[];

  const slots: ConflictSlot[] = slotRows.map(r => ({
    scheduleId: Number(r.scheduleId),
    offeringId: Number(r.offeringId),
    dayOfWeek: r.dayOfWeek == null ? null : Number(r.dayOfWeek),
    startTime: String(r.startTime ?? '').slice(0, 5),
    endTime: String(r.endTime ?? '').slice(0, 5),
    roomId: r.roomId == null ? null : Number(r.roomId),
    roomName: r.roomName ?? null,
    professorId: r.professorId == null ? null : Number(r.professorId),
    professorName: r.professorName ?? null,
    courseCode: String(r.courseCode ?? ''),
    courseTitle: String(r.courseTitle ?? ''),
    groupNumber: Number(r.groupNumber ?? 1),
    enrolledCount: Number(r.enrolledCount ?? 0),
    sharedScheduleGroupKey: r.sharedScheduleGroupKey ?? null,
  }));

  const scan = detectScheduleConflicts(slots);

  // ── وضعیتِ «بررسی شد» — تداخلی که کارشناس پذیرفته، دوباره بالا نمی‌آید ──
  const revRows = (await db.execute<Record<string, unknown>>(sql`
    select r."fingerprint" as "fingerprint", r.status as "status",
           r."reasonCode" as "reasonCode", r."reasonText" as "reasonText",
           nullif(trim(coalesce(ru."firstName", '') || ' ' || coalesce(ru."lastName", '')), '') as "reviewedByName",
           to_char(r."reviewedAt", 'YYYY-MM-DD HH24:MI') as "reviewedAt"
    from schedule_conflict_reviews r
    left join users ru on ru.id = r."reviewedByUserId"
    where r."termId" = ${termId}
  `)).rows;

  const reviewed: Record<string, ConflictReviewRow> = {};
  for (const raw of revRows) {
    const fp = String(raw.fingerprint ?? '');
    if (!fp) continue;
    reviewed[fp] = {
      fingerprint: fp,
      status: String(raw.status ?? 'REVIEWED'),
      reasonCode: raw.reasonCode == null ? null : String(raw.reasonCode),
      reasonText: raw.reasonText == null ? null : String(raw.reasonText),
      reviewedByName: raw.reviewedByName == null ? null : String(raw.reviewedByName),
      reviewedAt: raw.reviewedAt == null ? null : String(raw.reviewedAt),
    };
  }

  const groups = groupConflictPairs(scan.pairs, p => Boolean(reviewed[p.fingerprint]));
  const openGroups = groups.filter(g => !g.reviewed);

  return {
    termId,
    pairs: scan.pairs,
    groups,
    reviewed,
    summary: summarizeConflicts(scan.pairs),
    rawOverlaps: scan.rawOverlaps,
    mergedSkipped: scan.mergedSkipped,
    slotsScanned: scan.slotsScanned,
    duplicateSlots: scan.duplicateSlots,
    reviewedCount: Object.keys(reviewed).length,
    openIssues: openGroups.length,
    totalIssues: groups.length,
    likelyMergedIssues: openGroups.filter(g => g.likelyMerged).length,
  };
}

/** فهرستِ ترم‌های دانشگاهِ فعال (جدیدترین اول) — برای انتخاب‌گر بالای صفحه */
export async function listTermsForConflicts(universityId: number): Promise<{ id: number; termCode: string; title: string }[]> {
  const rows = (await db.execute(sql`
    select id, "termCode" as "termCode", coalesce(title, "termCode") as "title"
    from academic_terms
    where "universityId" = ${universityId}
    order by "termCode" desc
    limit 40
  `)).rows as { id: number; termCode: string; title: string }[];
  return rows.map(r => ({ id: Number(r.id), termCode: String(r.termCode), title: String(r.title) }));
}

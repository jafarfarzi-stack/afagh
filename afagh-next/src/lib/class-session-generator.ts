// ════════════════════════════════════════════════════════════════════════
// فاز ۶ — تولید جلسات واقعی کلاس (پاسخ به بازبینی بند ۱۱: «۱۶ × تعداد کلاس»
// فقط یک عدد بود؛ اکنون ردیف‌های class_sessions واقعاً ساخته می‌شوند)
// ────────────────────────────────────────────────────────────────────────
//  Course Offering → سطر schedule (روز/ساعت/نوع هفته) → تاریخ‌های جلسه از
//  ابتدای ترم (sessionDatesFor — خالص) → درج class_sessions به‌همراه sessionNo
//  و تاریخ شمسی. Idempotent: جلسه‌های موجود (offeringId + sessionNo) دوباره
//  ساخته نمی‌شوند — اجرای دوباره فقط «جلسهٔ گم‌شده» را کامل می‌کند.
// ════════════════════════════════════════════════════════════════════════
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, class_sessions, course_offerings, courses, schedules } from '@/db/schema';
import { toJalaliFromDate } from './calendar';
import { sessionDatesFor } from './scheduling-core';

export interface GenerateSessionsResult {
  ok: boolean;
  error?: string;
  created: number;
  skipped: number;
  warnings: string[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * تولید جلسات ترم برای همهٔ دروس دارای برنامهٔ هفتگی.
 * شرط‌ها: ترم شروع‌دار · سطر schedule با روز معتبر · کلاس فعال.
 */
export async function generateClassSessionsForTerm(
  termId: number,
  opts: { totalSessions?: number } = {}
): Promise<GenerateSessionsResult> {
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!term) return { ok: false, error: 'ترم یافت نشد.', created: 0, skipped: 0, warnings: [] };
  if (!term.startDate) {
    return { ok: false, error: 'برای این ترم تاریخ شروع ثبت نشده است؛ پیش از تولید جلسات، startDate را تعیین کنید.', created: 0, skipped: 0, warnings: [] };
  }

  const rows = await db
    .select({
      offeringId: schedules.offeringId,
      dayOfWeek: schedules.dayOfWeek,
      scheduleType: schedules.scheduleType,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      courseTitle: courses.title,
      isActive: course_offerings.isActive,
    })
    .from(schedules)
    .innerJoin(course_offerings, eq(course_offerings.id, schedules.offeringId))
    .innerJoin(courses, eq(courses.id, course_offerings.courseId))
    .where(eq(course_offerings.termId, termId));

  const offeringIds = [...new Set(rows.map((r) => r.offeringId))];
  // همهٔ sessionNoهای موجود یک‌جا — بدون N+1
  const existingRows = offeringIds.length
    ? await db
        .select({ offeringId: class_sessions.offeringId, sessionNo: class_sessions.sessionNo })
        .from(class_sessions)
        .where(inArray(class_sessions.offeringId, offeringIds))
    : [];
  const existing = new Map<number, Set<number>>();
  for (const e of existingRows) {
    if (!existing.has(e.offeringId)) existing.set(e.offeringId, new Set());
    existing.get(e.offeringId)!.add(e.sessionNo ?? -1);
  }

  const total = opts.totalSessions ?? 16;
  const warnings: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const r of rows) {
    if (r.isActive !== 1) continue;
    if (r.dayOfWeek == null || r.dayOfWeek < 1 || r.dayOfWeek > 6) {
      warnings.push(`«${r.courseTitle}»: روز هفته ثبت نشده — جلساتش ساخته نشد.`);
      continue;
    }
    const type = (r.scheduleType as 'ALL' | 'EVEN' | 'ODD') || 'ALL';
    const dates = sessionDatesFor(term.startDate, r.dayOfWeek, type, total);
    const has = existing.get(r.offeringId) ?? new Set<number>();
    for (const d of dates) {
      if (has.has(d.sessionNo)) { skipped++; continue; }
      const j = toJalaliFromDate(d.date);
      await db.insert(class_sessions).values({
        offeringId: r.offeringId,
        sessionDate: `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`,
        startTime: String(r.startTime).slice(0, 5),
        endTime: String(r.endTime).slice(0, 5),
        sessionNo: d.sessionNo,
        status: 'SCHEDULED',
      });
      created++;
    }
  }

  return { ok: true, created, skipped, warnings };
}

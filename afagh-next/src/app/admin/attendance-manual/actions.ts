'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { class_sessions, course_offerings, professor_class_attendance } from '@/db/schema';
import { getStaffByUser, requireRole } from '@/lib/auth';

/**
 * تأیید/لغو دستی حضور استاد برای یک جلسهٔ کلاس (کارشناس آموزش).
 *
 * اثر انگشت خودکار از گیت خوانده می‌شود؛ این مسیر برای مواردی است که دستگاه
 * ثبت نکرده (خرابی/ورود از درِ دیگر/مأموریت). روش ثبت `MANUAL_BY_EXPERT` و
 * هویت تأییدکننده + یادداشت ذخیره می‌شود تا قابل ممیزی باشد.
 */
export async function confirmProfessorAttendanceAction(px: {
  sessionId: number;
  staffId: number;
  isPresent: boolean;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };

    const sessionId = Number(px.sessionId);
    const staffId = Number(px.staffId);
    if (!sessionId || !staffId) return { ok: false, error: 'جلسه یا استاد نامعتبر است.' };

    const [session] = await db
      .select({ id: class_sessions.id, offeringId: class_sessions.offeringId })
      .from(class_sessions)
      .where(eq(class_sessions.id, sessionId))
      .limit(1);
    if (!session) return { ok: false, error: 'جلسه یافت نشد.' };

    const [offering] = await db
      .select({ universityId: course_offerings.universityId })
      .from(course_offerings)
      .where(eq(course_offerings.id, session.offeringId))
      .limit(1);

    await db.transaction(async tx => {
      await tx.delete(professor_class_attendance).where(and(
        eq(professor_class_attendance.sessionId, sessionId),
        eq(professor_class_attendance.staffId, staffId),
      ));
      await tx.insert(professor_class_attendance).values({
        sessionId,
        staffId,
        verificationMethod: 'MANUAL_BY_EXPERT',
        status: px.isPresent ? 'VALID' : 'REVOKED',
        note: (px.note ?? '').toString().slice(0, 300) || null,
        confirmedByStaffId: me.id,
        universityId: offering?.universityId ?? null,
      });
    });

    revalidatePath('/admin/attendance-manual');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'ثبت حضور ممکن نشد.' };
  }
}

/**
 * تیک «تشکیل کلاس» توسط کارشناس آموزش (زنده) — همان چیزی که پیش‌تر فقط استاد
 * در کارتابل خودش می‌توانست ثبت کند.
 *
 * `class_sessions.status` همان منبعی است که موتور حقوق (`payroll-engine`) و
 * کارنامهٔ عملکرد استاد از آن «جلسات برگزارشده» را می‌شمارند؛ پس تیک کارشناس
 * مستقیماً روی محاسبهٔ کسور/حق‌الزحمه اثر می‌گذارد.
 * «لغو» جلسه را به SCHEDULED برمی‌گرداند و `updatedAt` هم به‌روز می‌شود.
 */
export async function markClassHeldAction(px: {
  sessionId: number;
  held: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
    const me = await getStaffByUser(user.id);
    if (!me) return { ok: false, error: 'پروندهٔ پرسنلی یافت نشد.' };

    const sessionId = Number(px.sessionId);
    if (!sessionId) return { ok: false, error: 'جلسه نامعتبر است.' };

    const [row] = await db
      .select({
        id: class_sessions.id,
        universityId: course_offerings.universityId,
      })
      .from(class_sessions)
      .innerJoin(course_offerings, eq(course_offerings.id, class_sessions.offeringId))
      .where(eq(class_sessions.id, sessionId))
      .limit(1);
    if (!row) return { ok: false, error: 'جلسه یافت نشد.' };

    // مرز دانشگاه: کارشناس فقط جلسات دانشگاه مجاز خودش را تیک می‌زند
    const { canActOnUniversity } = await import('@/lib/university-scope');
    if (row.universityId != null && !(await canActOnUniversity(row.universityId))) {
      return { ok: false, error: 'این جلسه در دانشگاه شما نیست.' };
    }

    await db
      .update(class_sessions)
      .set({ status: px.held ? 'HELD' : 'SCHEDULED', updatedAt: new Date() })
      .where(eq(class_sessions.id, sessionId));

    revalidatePath('/admin/attendance-manual');
    revalidatePath('/admin/class-sessions');
    revalidatePath('/professor/attendance');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'ثبت تشکیل کلاس ممکن نشد.' };
  }
}

/** خلاصهٔ حضور دستیِ ثبت‌شده برای یک ترم (برای نمایش وضعیت در همان صفحه) */export async function manualAttendanceStatsAction(termId: number) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const rows = await db.execute(sql`
    select count(*)::int as total,
           count(*) filter (where pca."verificationMethod" in ('MANUAL_BY_EXPERT', 'QR_BY_CONTROLLER'))::int as manual
      from professor_class_attendance pca
      join class_sessions cs on cs.id = pca."sessionId"
      join course_offerings o on o.id = cs."offeringId"
     where o."termId" = ${Number(termId)}
  `);
  return (rows.rows?.[0] ?? { total: 0, manual: 0 }) as { total: number; manual: number };
}

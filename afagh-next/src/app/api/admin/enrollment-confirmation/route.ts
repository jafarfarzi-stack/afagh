import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, students } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { appendAudit } from '@/lib/audit';
import { getPublicBaseUrl } from '@/lib/settings';
import { issueEnrollConfirmToken } from '@/lib/verification';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'api.admin.enrollment-confirmation' });
const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'] as const;

/**
 * صدور تأییدیهٔ انتخاب واحد برای یک دانشجو توسط کارشناس آموزش.
 * GET ?studentId=&termId= → { token, verifyUrl, expiresAt }
 * کارشناس با باز کردن verifyUrl برگه را چاپ می‌کند (همان صفحهٔ عمومی).
 */
export async function GET(req: NextRequest) {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
  } catch (e) {
    log.warn('enrollment-confirmation auth error', { err: e });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);

    // فهرست نیمسال‌های دانشگاه فعال (برای فرم کارشناس)
    if (searchParams.get('action') === 'terms') {
      const { getCurrentUniversity } = await import('@/lib/university-scope');
      const uni = await getCurrentUniversity().catch(() => null);
      const rows = await db
        .select({
          id: academic_terms.id,
          title: academic_terms.title,
          isCurrent: academic_terms.isCurrent,
        })
        .from(academic_terms)
        .where(uni ? eq(academic_terms.universityId, uni.id) : undefined)
        .orderBy(desc(academic_terms.id))
        .limit(60);
      return NextResponse.json({ terms: rows });
    }

    const studentId = Number(searchParams.get('studentId'));
    const termId = Number(searchParams.get('termId'));
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return NextResponse.json({ error: 'invalid_studentId' }, { status: 400 });
    }
    if (!Number.isInteger(termId) || termId <= 0) {
      return NextResponse.json({ error: 'invalid_termId' }, { status: 400 });
    }

    const [stu] = await db
      .select({ id: students.id, userId: students.userId, studentCode: students.studentCode, universityId: students.universityId })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!stu || !stu.userId) {
      return NextResponse.json({ error: 'student_not_found' }, { status: 404 });
    }

    // 🔒 مرز دانشگاه: صدور تأییدیهٔ عمومی برای دانشجوی دانشگاه دیگر ممنوع
    const { requireStudentUniversity } = await import('@/lib/security');
    const uniGate = await requireStudentUniversity(studentId);
    if (!uniGate.ok) return NextResponse.json({ error: uniGate.error }, { status: 403 });

    const [term] = await db
      .select({ id: academic_terms.id, universityId: academic_terms.universityId })
      .from(academic_terms)
      .where(eq(academic_terms.id, termId))
      .limit(1);
    if (!term) return NextResponse.json({ error: 'term_not_found' }, { status: 404 });
    if (term.universityId != null && stu.universityId != null && term.universityId !== stu.universityId) {
      return NextResponse.json({ error: 'این نیمسال به دانشگاه دیگری تعلق دارد.' }, { status: 403 });
    }

    let issued: { token: string; expiresAt: string };
    try {
      issued = await issueEnrollConfirmToken(stu.userId, termId, { id: stu.id, code: stu.studentCode, universityId: stu.universityId });
    } catch (e) {
      // 🔒 پیام خام به کلاینت برنمی‌گردد — فقط لاگ سرور.
      console.error('[api] enrollment-confirmation issue failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'issue_failed' }, { status: 500 });
    }

    const verifyUrl = `${await getPublicBaseUrl()}/verify-enrollment/${encodeURIComponent(issued.token)}`;

    const actor = await getSessionUser().catch(() => null);
    await db
      .transaction(tx =>
        appendAudit(tx, {
          actorUserId: actor?.id ?? null,
          action: 'ENROLL_CONFIRM_ISSUED',
          entityType: 'student',
          entityId: studentId,
          details: JSON.stringify({ termId, expiresAt: issued.expiresAt }),
        }),
      )
      .catch(e => log.warn('enrollment-confirmation audit failed', { err: e }));

    return NextResponse.json({ token: issued.token, verifyUrl, expiresAt: issued.expiresAt });
  } catch (e) {
    log.error('enrollment-confirmation GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

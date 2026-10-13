import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { students } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { appendAudit } from '@/lib/audit';
import { getPublicBaseUrl } from '@/lib/settings';
import { issueFinanceStatementToken } from '@/lib/verification';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'api.admin.finance-statement' });
const ALLOWED = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'] as const;

/**
 * صدور لینک استعلام رسمی کارنامهٔ مالی برای یک دانشجو توسط کارشناس مالی.
 * GET ?studentId= → { token, verifyUrl, expiresAt }
 * کارشناس با باز کردن verifyUrl برگه را چاپ می‌کند (همان صفحهٔ عمومی).
 */
export async function GET(req: NextRequest) {
  try {
    const role = await requireRole([...ALLOWED]);
    if (role instanceof NextResponse) return role;
  } catch (e) {
    log.warn('finance-statement auth error', { err: e });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const studentId = Number(searchParams.get('studentId'));
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return NextResponse.json({ error: 'invalid_studentId' }, { status: 400 });
    }

    const [stu] = await db
      .select({ id: students.id, userId: students.userId })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!stu || !stu.userId) {
      return NextResponse.json({ error: 'student_not_found' }, { status: 404 });
    }

    let issued: { token: string; expiresAt: string };
    try {
      issued = await issueFinanceStatementToken(stu.userId);
    } catch (e) {
      return NextResponse.json({ error: (e as Error)?.message || 'issue_failed' }, { status: 500 });
    }

    const verifyUrl = `${await getPublicBaseUrl()}/verify-finance/${encodeURIComponent(issued.token)}`;

    const actor = await getSessionUser().catch(() => null);
    await db
      .transaction(tx =>
        appendAudit(tx, {
          actorUserId: actor?.id ?? null,
          action: 'FINANCE_STMT_ISSUED',
          entityType: 'student',
          entityId: studentId,
          details: JSON.stringify({ expiresAt: issued.expiresAt }),
        }),
      )
      .catch(e => log.warn('finance-statement audit failed', { err: e }));

    return NextResponse.json({ token: issued.token, verifyUrl, expiresAt: issued.expiresAt });
  } catch (e) {
    log.error('finance-statement GET failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

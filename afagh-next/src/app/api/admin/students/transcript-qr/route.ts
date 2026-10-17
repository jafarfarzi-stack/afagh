import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { students } from '@/db/schema';
import { requireRoleOrPermission } from '@/lib/permissions-enforcer';
import { getCurrentUniversity } from '@/lib/university-scope';
import { issueTranscriptToken } from '@/lib/verification';
import { qrSvg } from '@/lib/qr';
import { getPublicBaseUrl } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * QR استعلام کارنامهٔ تحصیلی برای پنل ادمین.
 *
 * چرا API و نه رندر مستقیم؟ فهرست دانشجویان صدها ردیف دارد و ساختن QR برای همه
 * سنگین است؛ این مسیر فقط برای دانشجویی که کارنامه‌اش باز شده توکن و QR می‌سازد
 * (همان توکنی که صفحهٔ عمومی `/verify-transcript/[token]` می‌شناسد).
 */
export async function GET(request: Request) {
  try {
    await requireRoleOrPermission(
      ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'MILITARY_OFFICER', 'GRADUATEAFFAIRS'],
      ['students:view_dossier'],
    );

    const url = new URL(request.url);
    const studentId = Number(url.searchParams.get('studentId') ?? 0);
    if (!studentId) return Response.json({ error: 'شناسهٔ دانشجو الزامی است' }, { status: 400 });

    const uni = await getCurrentUniversity().catch(() => null);
    const [stu] = await db
      .select({ userId: students.userId, universityId: students.universityId })
      .from(students)
      .where(uni ? and(eq(students.id, studentId), eq(students.universityId, uni.id)) : eq(students.id, studentId))
      .limit(1);
    if (!stu) return Response.json({ error: 'دانشجو یافت نشد' }, { status: 404 });
    if (!stu.userId) return Response.json({ error: 'این دانشجو حساب کاربری ندارد؛ استعلام ممکن نیست' }, { status: 409 });

    const publicBaseUrl = await getPublicBaseUrl();
    const issued = await issueTranscriptToken(stu.userId);
    const verifyUrl = `${publicBaseUrl}/verify-transcript/${encodeURIComponent(issued.token)}`;
    const qr = await qrSvg(verifyUrl, { errorCorrectionLevel: 'Q', size: 128, margin: 4 });

    return Response.json({ url: verifyUrl, qr, expiresAt: issued.expiresAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'NEXT_REDIRECT' || msg === 'NEXT_NOT_FOUND') throw e;
    console.error('[api] admin/students/transcript-qr failed:', msg || e);
    return Response.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}

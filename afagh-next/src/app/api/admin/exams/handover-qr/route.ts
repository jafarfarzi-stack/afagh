import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { issueExamHandoverToken, type ExamHandoverStep } from '@/lib/verification';
import { qrSvg } from '@/lib/qr';
import { getPublicBaseUrl } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * QR تحویل اوراق امتحان — برای نمایش به تحویلگیرنده (مخزن یا استاد).
 *
 * فرستنده (مراقب/مخزن) این را روی صفحه نشان میدهد؛ تحویلگیرنده اسکن میکند و
 * صفحهٔ `/exam-handover/<token>` جزئیات را نشان داده و با تأییدش، مرحله ثبت میشود.
 */
export async function GET(request: Request) {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'PROCTOR', 'VAULT_MANAGER']);
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return Response.json({ error: 'دانشگاه فعال مشخص نیست' }, { status: 400 });

    const url = new URL(request.url);
    const step = String(url.searchParams.get('step') ?? '').toUpperCase() as ExamHandoverStep;
    if (!['VAULT', 'FINALIZE', 'INSTRUCTOR', 'ARCHIVE'].includes(step)) {
      return Response.json({ error: 'نوع تحویل نامعتبر است' }, { status: 400 });
    }
    const sessionId = Number(url.searchParams.get('sessionId') ?? 0) || null;
    const hallId = Number(url.searchParams.get('hallId') ?? 0) || null;
    const offeringId = Number(url.searchParams.get('offeringId') ?? 0) || null;
    if ((step === 'INSTRUCTOR' || step === 'ARCHIVE') && !offeringId) {
      return Response.json({ error: 'ارائهٔ درس الزامی است' }, { status: 400 });
    }
    if (step !== 'INSTRUCTOR' && step !== 'ARCHIVE' && !sessionId) {
      return Response.json({ error: 'جلسهٔ امتحان الزامی است' }, { status: 400 });
    }

    const publicBaseUrl = await getPublicBaseUrl();
    const issued = await issueExamHandoverToken({ step, sessionId, hallId, offeringId });
    const verifyUrl = `${publicBaseUrl}/exam-handover/${encodeURIComponent(issued.token)}`;
    const qr = await qrSvg(verifyUrl, { errorCorrectionLevel: 'Q', size: 128, margin: 4 });

    return Response.json({ url: verifyUrl, qr, expiresAt: issued.expiresAt, step });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'NEXT_REDIRECT' || msg === 'NEXT_NOT_FOUND') throw e;
    console.error('[api] exams/handover-qr failed:', msg || e);
    return Response.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}

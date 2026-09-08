import { NextRequest, NextResponse } from 'next/server';
import { appendAudit } from '@/lib/audit';
import { parseArchiveDecision } from '@/lib/archive-files';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_documents } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';

export const dynamic = 'force-dynamic';

// تأیید/رد مدرک بایگانی — کارشناس بایگانی یا ادمین
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('ARCHIVE_EXPERT'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = parseArchiveDecision(body);
  if (!parsed) return NextResponse.json({ error: 'شناسه یا تصمیم نامعتبر است' }, { status: 400 });
  const { docId, decision, reason } = parsed;
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(student_documents)
      .set({ verificationStatus: decision, verifiedBy: user.id, rejectionReason: decision === 'REJECTED' ? reason : null })
      .where(eq(student_documents.id, docId))
      .returning({ id: student_documents.id });
    if (!row) return null;
    await appendAudit(tx, {
      actorUserId: user.id, action: 'ARCHIVE_DOC_' + decision,
      entityType: 'student_documents', entityId: docId, details: JSON.stringify({ reason }),
    });
    return row;
  });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, docId, decision });
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs, student_documents } from '@/db/schema';
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
  const docId = Number(body?.docId);
  const decision = body?.decision === 'REJECTED' ? 'REJECTED' : 'VERIFIED';
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null;
  if (!docId) return NextResponse.json({ error: 'پارامتر ناقص' }, { status: 400 });

  const [updated] = await db.update(student_documents)
    .set({ verificationStatus: decision, verifiedBy: user.id, rejectionReason: decision === 'REJECTED' ? reason : null })
    .where(eq(student_documents.id, docId))
    .returning({ id: student_documents.id });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [last] = await db.select({ hash: audit_logs.hash }).from(audit_logs).orderBy(desc(audit_logs.id)).limit(1);
  const prevHash = last?.hash ?? '';
  const now = new Date();
  await db.insert(audit_logs).values({
    actorUserId: user.id, action: 'ARCHIVE_DOC_' + decision, entityType: 'student_documents', entityId: docId,
    details: JSON.stringify({ reason }), prevHash,
    hash: createHash('sha256').update(prevHash + '|ARCHIVE_DOC_' + decision + '|' + docId + '|' + now.toISOString()).digest('hex'),
  });
  return NextResponse.json({ ok: true, docId, decision });
}

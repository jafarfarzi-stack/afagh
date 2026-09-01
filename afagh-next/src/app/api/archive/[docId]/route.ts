import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_documents } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { presignGet } from '@/lib/objectStore';

export const dynamic = 'force-dynamic';

// سرو فایل از Object Storage با لینک امضاشدهٔ موقت — کنترل دسترسی پیش از امضا
export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = Number((await params).docId);
  const [doc] = await db.select().from(student_documents).where(eq(student_documents.id, id)).limit(1);
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // مالک مدرک یا کارشناس بایگانی/ادمین — بقیه حتی با دانستن docId نمی‌توانند
  const privileged = user.roles.includes('ADMIN') || user.roles.includes('ARCHIVE_EXPERT');
  if (!privileged && doc.personUserId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = await presignGet(doc.fileUrl, 300);
  return NextResponse.redirect(url, 307);
}

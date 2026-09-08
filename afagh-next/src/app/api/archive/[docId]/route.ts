import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_documents } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { ARCHIVE_BUCKET, S3 } from '@/lib/objectStore';
import { archiveFailureStatus, parseArchiveId, isSafeArchiveKey, readArchiveStream, readLocalArchive } from '@/lib/archive-files';
import path from 'path';

export const dynamic = 'force-dynamic';

// سرو فایل از Object Storage / فایل محلی با لینک امن و واترمارک
export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { docId } = await params;
    const id = parseArchiveId(docId);
    if (id === null) return NextResponse.json({ error: 'شناسه نامعتبر' }, { status: 400 });
    const [doc] = await db.select().from(student_documents).where(eq(student_documents.id, id)).limit(1);
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // مالک مدرک یا کارشناس بایگانی/ادمین
    const privileged = user.roles.includes('ADMIN') || user.roles.includes('ARCHIVE_EXPERT');
    if (!privileged && doc.personUserId !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // ── سرو امن محتوا: فقط نوع‌های مجاز رندر می‌شوند؛ بقیه attachment+octet-stream ──
    // (ضد Stored-XSS: حتی اگر رکورد قدیمی/آلوده mimeType خطرناک ذخیره کرده باشد)
    const SAFE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf']);
    const rawMime = (doc.mimeType || '').toLowerCase();
    const mime = SAFE_MIME.has(rawMime) ? rawMime : 'application/octet-stream';
    const forceDownload = !SAFE_MIME.has(rawMime);
    const safeHeaders = {
      'X-Watermark': encodeURIComponent(`${user.name} | ${new Date().toISOString()}`),
      // دفاع سه‌لایه: هیچ رندری از html/svg زندهٔ ذخیره‌شده؛ هیچ sniffing؛ هیچ کش عمومی
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:",
      'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.fileName || 'document')}`,
      'Cache-Control': 'private, max-age=300',
    };

    if (!isSafeArchiveKey(doc.fileUrl)) {
      return NextResponse.json({ error: 'کلید سند نامعتبر است' }, { status: 400 });
    }
    const cwd = process.cwd();
    const local = await readLocalArchive([
      path.resolve(cwd, '..', 'afagh-erp', 'data', 'uploads'),
      path.resolve(cwd, 'data', 'uploads'),
      path.resolve(cwd, '..', 'data', 'uploads'),
      path.resolve(cwd, 'public', 'uploads'),
    ], doc.fileUrl);
    if (local) return new NextResponse(new Uint8Array(local), { headers: { 'Content-Type': mime, ...safeHeaders } });

    try {
      const stream = await S3.getObject(ARCHIVE_BUCKET, doc.fileUrl);
      const buffer = await readArchiveStream(stream);
      return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': mime, ...safeHeaders } });
    } catch (error) {
      const status = archiveFailureStatus(error);
      console.error('[archive] object read failed', { docId: id, status });
      return NextResponse.json({ error: status === 404 ? 'فایل اصلی سند یافت نشد' : 'دریافت سند ممکن نیست؛ دوباره تلاش کنید' },
        { status, headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (err: any) {
    console.error('[archive] document read failed', { code: err?.code });
    return NextResponse.json({ error: 'دریافت سند ممکن نیست' }, { status: archiveFailureStatus(err), headers: { 'Cache-Control': 'no-store' } });
  }
}

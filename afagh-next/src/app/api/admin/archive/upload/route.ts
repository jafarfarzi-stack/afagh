import { appendAudit } from '@/lib/audit';
import { MAX_ARCHIVE_BYTES, parseArchiveId } from '@/lib/archive-files';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { student_documents } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { archiveKey, putArchiveObject, sha256 } from '@/lib/objectStore';

export const dynamic = 'force-dynamic';

// بارگذاری مدرک در Object Storage — سند §۲۴۳۸: فقط URL و هش در دیتابیس می‌ماند
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // ادمین/کارشناس بایگانی برای هر کس؛ دانشجو فقط برای خودش (e-KYC §۲۴۳۸)
  const privileged = user.roles.includes('ADMIN') || user.roles.includes('ARCHIVE_EXPERT');
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'فرم بارگذاری نامعتبر است' }, { status: 400 }); }
  const file = form.get('file') as File | null;
  const studentUserId = parseArchiveId(form.get('studentUserId'));
  if (!privileged && studentUserId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const categoryId = parseArchiveId(form.get('categoryId'));
  const rawTypeId = form.get('typeId');
  const typeId = rawTypeId ? parseArchiveId(rawTypeId) : null;
  if (!(file instanceof File) || studentUserId === null || categoryId === null || (!!rawTypeId && typeId === null)) return NextResponse.json({ error: 'پارامتر ناقص' }, { status: 400 });

  if (file.size > MAX_ARCHIVE_BYTES) return NextResponse.json({ error: 'حجم بیش از ۱۰MB' }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_ARCHIVE_BYTES) return NextResponse.json({ error: 'حجم بیش از ۱۰MB' }, { status: 413 });

  // ── whitelist سخت‌گیرانهٔ نوع محتوا (ضمیمهٔ آسیب‌پذیری Stored-XSS) ──
  // فقط فایل‌های تصویری/PDF پذیرفته می‌شوند؛ هیچ `text/html` یا `image/svg+xml`
  // (که می‌توانند اسکریپت اجرا کنند) از کلاینت قبول نمی‌شود.
  const SAFE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf']);
  const mime = (file.type || 'application/octet-stream').toLowerCase();
  if (!SAFE_MIME.has(mime)) {
    return NextResponse.json({ error: 'نوع فایل مجاز نیست (فقط تصویر یا PDF).' }, { status: 415 });
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const key = archiveKey(studentUserId, typeId ?? categoryId, ext);
  let stored: { size: number; etag: string };
  try { stored = await putArchiveObject(key, buf, mime); }
  catch {
    console.error('[archive] object upload failed');
    return NextResponse.json({ error: 'ذخیره‌ساز در دسترس نیست؛ دوباره تلاش کنید' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const { size, etag } = stored;

  // Object storage and PostgreSQL do not share a transaction. An upload may
  // leave an orphan object if the DB fails; never delete on an ambiguous commit.
  const row = await db.transaction(async tx => {
    const [document] = await tx.insert(student_documents).values({
      personUserId: studentUserId, categoryId, typeId,
      fileName: file.name, fileUrl: key, mimeType: mime,
    }).returning({ id: student_documents.id });
    await appendAudit(tx, {
      actorUserId: user.id, action: 'ARCHIVE_FILE_STORED',
      entityType: 'student_documents', entityId: document.id,
      details: JSON.stringify({ key, size, sha256: sha256(buf), etag }),
    });
    return document;
  });
  return NextResponse.json({ ok: true, docId: row.id, key, size });
}

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs, student_documents } from '@/db/schema';
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
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const studentUserId = Number(form.get('studentUserId'));
  if (!privileged && studentUserId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const categoryId = Number(form.get('categoryId'));
  const typeId = form.get('typeId') ? Number(form.get('typeId')) : null;
  if (!file || !studentUserId || !categoryId) return NextResponse.json({ error: 'پارامتر ناقص' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'حجم بیش از ۱۰MB' }, { status: 413 });

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
  const { size, etag } = await putArchiveObject(key, buf, file.type || 'application/octet-stream');

  const [row] = await db.insert(student_documents).values({
    personUserId: studentUserId, categoryId, typeId,
    fileName: file.name, fileUrl: key, mimeType: mime,
  }).returning({ id: student_documents.id });

  // ممیزی زنجیره‌ای — رویداد واقعی بایگانی
  const [last] = await db.select({ hash: audit_logs.hash }).from(audit_logs).orderBy(desc(audit_logs.id)).limit(1);
  const prevHash = last?.hash ?? '';
  const now = new Date();
  await db.insert(audit_logs).values({
    actorUserId: user.id, action: 'ARCHIVE_FILE_STORED', entityType: 'student_documents', entityId: row.id,
    details: JSON.stringify({ key, size, sha256: sha256(buf).slice(0, 16), etag: etag.slice(0, 16) }),
    prevHash,
    hash: createHash('sha256').update(prevHash + '|ARCHIVE_FILE_STORED|' + row.id + '|' + now.toISOString()).digest('hex'),
  });
  return NextResponse.json({ ok: true, docId: row.id, key, size });
}

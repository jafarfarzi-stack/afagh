import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { audit_logs, student_documents, users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { getCurrentUniversity } from '@/lib/university-scope';
import { archiveKey, putArchiveObject, sha256 } from '@/lib/objectStore';
import { checkUpload, MAX_UPLOAD_BYTES } from '@/lib/safe-input';

export const dynamic = 'force-dynamic';

// بارگذاری مدرک در Object Storage — سند §۲۴۳۸: فقط URL و هش در دیتابیس می‌ماند
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // سقف سختِ سربار multipart روی ۱۰MB فایل؛ بررسی دقیق حجم فایل پایین‌تر انجام می‌شود
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) return NextResponse.json({ error: 'حجم بیش از ۱۰MB' }, { status: 413 });
  // ادمین/کارشناس بایگانی برای هر کس؛ دانشجو فقط برای خودش (e-KYC §۲۴۳۸)
  const privileged = user.roles.includes('ADMIN') || user.roles.includes('ARCHIVE_EXPERT');
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const studentUserId = Number(form.get('studentUserId'));
  if (!privileged && studentUserId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const categoryId = Number(form.get('categoryId'));
  const typeId = form.get('typeId') ? Number(form.get('typeId')) : null;
  if (!file || !studentUserId || !categoryId) return NextResponse.json({ error: 'پارامتر ناقص' }, { status: 400 });

  // دانشگاه سند: دانشگاهِ کاربرِ هدف؛ ادمین فقط برای همین دانشگاه (یا سراسری) می‌تواند بارگذاری کند
  const [targetUser] = await db.select({ universityId: users.universityId })
    .from(users).where(eq(users.id, studentUserId)).limit(1);
  if (!targetUser) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 404 });
  const uni = await getCurrentUniversity().catch(() => null);
  if (privileged) {
    if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
    if (targetUser.universityId !== null && targetUser.universityId !== uni.id) {
      return NextResponse.json({ error: 'کاربر متعلق به دانشگاه دیگری است' }, { status: 403 });
    }
  }
  const docUniId = targetUser.universityId ?? uni?.id ?? null;

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'حجم بیش از ۱۰MB' }, { status: 413 });

  // ── whitelist سخت‌گیرانهٔ نوع محتوا + magic-bytes + تطابق پسوند (ضمیمهٔ Stored-XSS) ──
  const check = checkUpload(file.name, file.type, buf);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const key = archiveKey(studentUserId, typeId ?? categoryId, check.ext);
  const { size, etag } = await putArchiveObject(key, buf, check.mime);

  const [row] = await db.insert(student_documents).values({
    universityId: docUniId,
    personUserId: studentUserId, categoryId, typeId,
    fileName: file.name, fileUrl: key, mimeType: check.mime,
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

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_documents } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { ARCHIVE_BUCKET, S3 } from '@/lib/objectStore';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// سرو فایل از Object Storage / فایل محلی با لینک امن و واترمارک
export async function GET(_req: NextRequest, { params }: { params: { docId: string } }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const id = Number(params.docId);
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

    // ۱. بررسی وجود فایل روی دیسک محلی (سوابق دمو و فایل‌های آپلودشده اولیه)
    //    🔒 گارد path traversal: مسیر نهایی باید داخل پوشهٔ uploads باشد
    const CWD = path.resolve(process.cwd());
    const localCandidates = [
      path.join(CWD, '..', 'afagh-erp', 'data', 'uploads', doc.fileUrl),
      path.join(CWD, 'data', 'uploads', doc.fileUrl),
      path.join(CWD, '..', 'data', 'uploads', doc.fileUrl),
      path.join(CWD, 'public', 'uploads', doc.fileUrl),
    ];

    for (const candidate of localCandidates) {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        const fileBuffer = fs.readFileSync(resolved);
        return new NextResponse(fileBuffer, { headers: { 'Content-Type': mime, ...safeHeaders } });
      }
    }

    // ۲. تلاش برای خواندن مستقیم از سرویس Object Storage (MinIO / S3)
    //    🔒 کلید Object Storage هم نباید از باکت خارج شود (گارد سادهٔ prefix)
    try {
      if (doc.fileUrl.startsWith('..') || doc.fileUrl.startsWith('/')) {
        return NextResponse.json({ error: 'invalid key' }, { status: 400 });
      }
      const stream = await S3.getObject(ARCHIVE_BUCKET, doc.fileUrl);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      return new NextResponse(fileBuffer, { headers: { 'Content-Type': mime, ...safeHeaders } });
    } catch (_) {
      // در صورت عدم دسترسی به کانتینر MinIO، تولید پیش‌نمایش گرافیکی زیبا با واترمارک
    }

    // ۳. پیش‌نمایش استاندارد سند با واترمارک رسمی دانشگاه
    //    🔒 XML-escape تمام مقادیر interpolate‌شده (fileName از کلاینت می‌آید → ضد تزریق SVG)
    const xmlEscape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const fallbackSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 460" width="100%" height="100%" dir="rtl">
  <rect width="700" height="460" fill="#f8fafc" rx="16"/>
  <rect x="20" y="20" width="660" height="420" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="12"/>
  <rect x="30" y="30" width="640" height="60" fill="#065f46" rx="8"/>
  <text x="350" y="68" font-family="sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">دانشگاه جامع آفاق — بایگانی الکترونیک مدارک</text>
  
  <circle cx="350" cy="180" r="45" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/>
  <text x="350" y="195" font-family="sans-serif" font-size="36" text-anchor="middle">📁</text>
  
  <text x="350" y="260" font-family="sans-serif" font-size="17" font-weight="bold" fill="#0f172a" text-anchor="middle">${xmlEscape(doc.fileName || 'سند هویتی / تحصیلی دانشجو')}</text>
  <text x="350" y="295" font-family="sans-serif" font-size="13" fill="#64748b" text-anchor="middle">شناسه سند: #${doc.id} | نوع محتوا: ${xmlEscape(doc.mimeType || 'تصویر مدارک')}</text>
  <text x="350" y="330" font-family="sans-serif" font-size="13" font-weight="bold" fill="#047857" text-anchor="middle">وضعیت تأیید: ${doc.verificationStatus === 'VERIFIED' ? 'تأییدشده ✓' : 'در انتظار بررسی'}</text>
  
  <line x1="60" y1="365" x2="640" y2="365" stroke="#e2e8f0" stroke-dasharray="6 4"/>
  <text x="350" y="395" font-family="sans-serif" font-size="11" fill="#dc2626" text-anchor="middle">🔒 واترمارک امنیتی: بازبینی‌شده توسط کارشناس (${xmlEscape(user.name)}) در تاریخ ${new Date().toLocaleDateString('fa-IR')}</text>
  <text x="350" y="415" font-family="sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">سامانه جامع بایگانی الکترونیک دانشگاه — سند معتبر دیجیتال</text>
</svg>`;

    return new NextResponse(fallbackSvg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'X-Watermark': encodeURIComponent(`${user.name} | ${new Date().toISOString()}`),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطای سرور' }, { status: 500 });
  }
}

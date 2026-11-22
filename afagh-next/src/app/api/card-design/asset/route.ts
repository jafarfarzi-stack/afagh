import { NextRequest, NextResponse } from 'next/server';
import { ARCHIVE_BUCKET, S3 } from '@/lib/objectStore';
import { parseCardAssetKey } from '@/lib/student-card-designs';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

/**
 * سروِ تصاویر طراحیِ کارت (پس‌زمینه/امضا).
 *
 * کلید فقط از پیشوند `card-design/` پذیرفته می‌شود (parseCardAssetKey)، پس
 * این مسیر هرگز اسناد دانشجویان را لو نمی‌دهد. کلید یکتا در URL است و
 * پاسخ یک سال cache می‌شود؛ آپلود تازه = کلید تازه = cache تازه.
 */
export async function GET(req: NextRequest) {
  const key = parseCardAssetKey(req.nextUrl.searchParams.get('k'));
  if (!key) return new NextResponse('not found', { status: 404 });

  try {
    const stream = await S3.getObject(ARCHIVE_BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const ext = key.split('.').pop()?.toLowerCase() || '';
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { ARCHIVE_BUCKET, S3 } from '@/lib/objectStore';

export const dynamic = 'force-dynamic';

const SAFE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']);
/** نقش‌هایی که برای کار روزمره لازم است عکس افراد را ببینند */
const VIEWER_ROLES = ['ADMIN', 'EDU_EXPERT', 'ARCHIVE_EXPERT', 'VICE_EDU', 'DEP_HEAD', 'PROCTOR'];

/**
 * نمایش عکس یک شخص.
 *
 * عکس داده‌ای شخصی است: هر کس عکس خودش را می‌بیند و کارکنانِ دارای نقش
 * مرتبط عکس دیگران را. کلید شیء هرگز به کلاینت داده نمی‌شود تا لینک مستقیم
 * و همیشگیِ فایل لو نرود.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: raw } = await ctx.params;
  const userId = Number(raw);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'شناسهٔ نامعتبر' }, { status: 400 });
  }

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const privileged = me.roles.some(r => VIEWER_ROLES.includes(r));
  if (!privileged && me.id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [u] = await db.select({ key: users.photoKey, mime: users.photoMime })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.key) return NextResponse.json({ error: 'برای این شخص عکسی ثبت نشده است.' }, { status: 404 });
  if (u.key.startsWith('/') || u.key.includes('..')) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }

  try {
    const stream = await S3.getObject(ARCHIVE_BUCKET, u.key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    const body = Buffer.concat(chunks);
    const mime = SAFE_MIME.has((u.mime ?? '').toLowerCase()) ? (u.mime as string) : 'application/octet-stream';
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:",
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'فایل عکس در انبار فایل پیدا نشد.' }, { status: 404 });
  }
}
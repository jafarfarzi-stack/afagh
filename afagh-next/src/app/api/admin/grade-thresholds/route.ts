import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { grade_thresholds, degree_level_configs } from '@/db/schema';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { clearThresholdCache } from '@/lib/grade-qualitative';
import { getCurrentUniversity } from '@/lib/university-scope';

const ALLOWED = ['ADMIN', 'EDU_EXPERT'];

// GET — دریافت آستانه‌ها برای یک مقطع یا همه
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const degreeLevelId = Number(req.nextUrl.searchParams.get('degreeLevelId') || 0);
  const uni = await getCurrentUniversity().catch(() => null);
  const uniScope = uni ? or(eq(grade_thresholds.universityId, uni.id), isNull(grade_thresholds.universityId)) : undefined;
  const where = and(
    degreeLevelId ? eq(grade_thresholds.degreeLevelId, degreeLevelId) : undefined,
    uniScope,
  );
  const rows = await db
    .select()
    .from(grade_thresholds)
    .where(where)
    .orderBy(asc(grade_thresholds.degreeLevelId), asc(grade_thresholds.sortOrder));

  // حالت نمایش مقطع
  const [degreeLevel] = degreeLevelId
    ? await db.select({ transcriptDisplayMode: degree_level_configs.transcriptDisplayMode }).from(degree_level_configs).where(eq(degree_level_configs.id, degreeLevelId)).limit(1)
    : [];

  return NextResponse.json({
    ok: true,
    thresholds: rows,
    transcriptDisplayMode: degreeLevel?.transcriptDisplayMode ?? 'NUMERIC',
  });
}

// POST — ایجاد یا به‌روزرسانی آستانه‌ها
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const body = await req.json();
  const { degreeLevelId, transcriptDisplayMode, thresholds } = body;
  if (!degreeLevelId) {
    return NextResponse.json({ ok: false, error: 'مقطع تحصیلی الزامی است.' }, { status: 400 });
  }
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return NextResponse.json({ ok: false, error: 'دانشگاه فعال نامشخص است.' }, { status: 400 });
  // مقطع باید متعلق به همین دانشگاه (یا سراسری) باشد
  const [deg] = await db.select({ universityId: degree_level_configs.universityId })
    .from(degree_level_configs).where(eq(degree_level_configs.id, degreeLevelId)).limit(1);
  if (!deg) return NextResponse.json({ ok: false, error: 'مقطع یافت نشد.' }, { status: 404 });
  if (deg.universityId !== null && deg.universityId !== uni.id) {
    return NextResponse.json({ ok: false, error: 'مقطع متعلق به دانشگاه دیگری است.' }, { status: 403 });
  }

  // به‌روزرسانی حالت نمایش
  if (transcriptDisplayMode) {
    await db.update(degree_level_configs)
      .set({ transcriptDisplayMode })
      .where(and(eq(degree_level_configs.id, degreeLevelId), or(eq(degree_level_configs.universityId, uni.id), isNull(degree_level_configs.universityId))));
  }

  // حذف آستانه‌های قبلی و درج جدید
  if (Array.isArray(thresholds)) {
    await db.delete(grade_thresholds).where(and(eq(grade_thresholds.degreeLevelId, degreeLevelId), or(eq(grade_thresholds.universityId, uni.id), isNull(grade_thresholds.universityId))));
    for (let i = 0; i < thresholds.length; i++) {
      const t = thresholds[i];
      await db.insert(grade_thresholds).values({
        universityId: uni.id,
        degreeLevelId,
        label: t.label,
        minValue: String(t.minValue),
        maxValue: String(t.maxValue),
        passed: t.passed ? 1 : 0,
        sortOrder: i + 1,
      });
    }
  }

  clearThresholdCache(degreeLevelId);
  revalidatePath('/admin/grade-status-codes');
  return NextResponse.json({ ok: true, message: 'آستانه‌ها ذخیره شد.' });
}

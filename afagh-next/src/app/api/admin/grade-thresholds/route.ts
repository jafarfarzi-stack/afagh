import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { grade_thresholds, degree_level_configs } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { clearThresholdCache } from '@/lib/grade-qualitative';

const ALLOWED = ['ADMIN', 'EDU_EXPERT'];

// GET — دریافت آستانه‌ها برای یک مقطع یا همه
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const degreeLevelId = Number(req.nextUrl.searchParams.get('degreeLevelId') || 0);
  const where = degreeLevelId ? eq(grade_thresholds.degreeLevelId, degreeLevelId) : undefined;
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

  // به‌روزرسانی حالت نمایش
  if (transcriptDisplayMode) {
    await db.update(degree_level_configs)
      .set({ transcriptDisplayMode })
      .where(eq(degree_level_configs.id, degreeLevelId));
  }

  // حذف آستانه‌های قبلی و درج جدید
  if (Array.isArray(thresholds)) {
    await db.delete(grade_thresholds).where(eq(grade_thresholds.degreeLevelId, degreeLevelId));
    for (let i = 0; i < thresholds.length; i++) {
      const t = thresholds[i];
      await db.insert(grade_thresholds).values({
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

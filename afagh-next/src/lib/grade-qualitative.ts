// ═══════════════════════════════════════════════════════════════════
//  تبدیل نمره عددی ↔ درجه کیفی بر اساس آستانه‌های مقطع تحصیلی
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/db';
import { grade_thresholds } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export type GradeThreshold = {
  id: number;
  degreeLevelId: number;
  label: string;
  minValue: string;
  maxValue: string;
  passed: number;
  sortOrder: number;
};

export type TranscriptDisplayMode = 'NUMERIC' | 'QUALITATIVE' | 'BOTH';

/**
 * دریافت آستانه‌های یک مقطع از DB (کش ساده)
 */
const cache = new Map<number, GradeThreshold[]>();

export async function getThresholds(degreeLevelId: number): Promise<GradeThreshold[]> {
  if (cache.has(degreeLevelId)) return cache.get(degreeLevelId)!;
  const rows = await db
    .select()
    .from(grade_thresholds)
    .where(eq(grade_thresholds.degreeLevelId, degreeLevelId))
    .orderBy(asc(grade_thresholds.sortOrder));
  cache.set(degreeLevelId, rows);
  return rows;
}

/**
 * تبدیل نمره عددی به درجه کیفی
 * @returns برچسب کیفی یا null اگر آستانه‌ای پیدا نشد
 */
export async function numericToQualitative(
  grade: number,
  degreeLevelId: number
): Promise<string | null> {
  const thresholds = await getThresholds(degreeLevelId);
  for (const t of thresholds) {
    const min = Number(t.minValue);
    const max = Number(t.maxValue);
    if (grade >= min && grade <= max) return t.label;
  }
  return null;
}

/**
 * تبدیل درجه کیفی به حد وسط بازه (برای ورودی کاربر)
 */
export async function qualitativeToNumeric(
  label: string,
  degreeLevelId: number
): Promise<number | null> {
  const thresholds = await getThresholds(degreeLevelId);
  const t = thresholds.find(th => th.label === label);
  if (!t) return null;
  const min = Number(t.minValue);
  const max = Number(t.maxValue);
  return Math.round(((min + max) / 2) * 100) / 100;
}

/**
 * آیا نمره قبول است؟
 */
export async function isPassed(
  grade: number,
  degreeLevelId: number
): Promise<boolean> {
  const thresholds = await getThresholds(degreeLevelId);
  for (const t of thresholds) {
    const min = Number(t.minValue);
    const max = Number(t.maxValue);
    if (grade >= min && grade <= max) return t.passed === 1;
  }
  return grade >= 10; // پیش‌فرض
}

/**
 * پاک کردن کش (برای بعد از ویرایش آستانه‌ها)
 */
export function clearThresholdCache(degreeLevelId?: number) {
  if (degreeLevelId) cache.delete(degreeLevelId);
  else cache.clear();
}

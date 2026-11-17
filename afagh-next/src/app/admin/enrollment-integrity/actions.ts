'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity, isRealUniversityId } from '@/lib/university-scope';
import {
  applyDuplicateCleanup,
  countDrift,
  planDuplicateCleanup,
  recountDriftedOfferings,
  recountTermOfferings,
} from '@/lib/enrollment-count';

/**
 * اقداماتِ «سلامت ثبت‌نام‌ها» — هر اقدام دوباره گاردِ نقش و دانشگاه را می‌گیرد
 * (هیچ action به دادهٔ دانشگاهِ دیگر دست نمی‌زند).
 *
 * هیچ‌کدام ردیفِ enrollments را حذف نمی‌کند: پاک‌سازی = soft-drop.
 */

const ROLES = ['ADMIN', 'EDU_EXPERT'] as const;
const PATH = '/admin/enrollment-integrity';
const UNI_ERROR = 'دانشگاه فعال مشخص نیست؛ عملیات انجام نشد.';
const GENERIC_ERROR = 'خطای غیرمنتظره در اجرای عملیات.';

async function scope(): Promise<{ universityId: number }> {
  await requireRole([...ROLES]);
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni || !isRealUniversityId(uni.id)) throw new Error(UNI_ERROR);
  return { universityId: uni.id };
}

function message(e: unknown): string {
  const m = String((e as Error)?.message ?? '').trim();
  return m || GENERIC_ERROR;
}

// ── پیش‌نمایشِ پاک‌سازیِ ردیف‌های تکراری (بدون هیچ نوشتن) ──
export type PreviewResult =
  | { ok: true; groups: number; rowsToDrop: number; sample: any[] }
  | { ok: false; error: string };

export async function previewDuplicateCleanupAction(): Promise<PreviewResult> {
  try {
    const { universityId } = await scope();
    const plan = await planDuplicateCleanup(universityId, 50);
    // پیش‌نمایش چیزی نمی‌نویسد، اما تازه‌سازی کش مسیر برای هم‌خوانی با داشبورد.
    revalidatePath(PATH);
    return { ok: true, groups: plan.groups, rowsToDrop: plan.rowsToDrop, sample: plan.sample };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── اجرای پاک‌سازی — فقط با تأییدِ صریح ──
export type ApplyResult =
  | { ok: true; groups: number; rowsDropped: number; offeringsRecounted: number }
  | { ok: false; error: string };

export async function applyDuplicateCleanupAction(confirm: boolean): Promise<ApplyResult> {
  try {
    const { universityId } = await scope();
    if (confirm !== true) {
      return { ok: false, error: 'اجرای پاک‌سازی فقط با تأیید صریح مجاز است.' };
    }
    const result = await applyDuplicateCleanup(universityId, 200);
    revalidatePath(PATH);
    revalidatePath('/admin/reports');
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── اصلاحِ شمارندهٔ ارائه‌های ناهمگام ──
export type FixDriftResult =
  | { ok: true; offerings: number; driftBefore: number }
  | { ok: false; error: string };

export async function fixOfferingDriftAction(): Promise<FixDriftResult> {
  try {
    const { universityId } = await scope();
    const before = await countDrift(universityId);
    const offerings = await recountDriftedOfferings(universityId, 200);
    revalidatePath(PATH);
    revalidatePath('/admin/reports');
    return { ok: true, offerings, driftBefore: before.totalDrift };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── اصلاحِ همهٔ ارائه‌های یک ترم ──
export type FixTermResult =
  | { ok: true; termId: number; updated: number }
  | { ok: false; error: string };

export async function fixTermDriftAction(termId: number): Promise<FixTermResult> {
  try {
    const { universityId } = await scope();
    const id = Number(termId);
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: 'ترم انتخاب‌شده معتبر نیست.' };
    }
    const updated = await recountTermOfferings(id, universityId);
    revalidatePath(PATH);
    revalidatePath('/admin/reports');
    return { ok: true, termId: id, updated };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

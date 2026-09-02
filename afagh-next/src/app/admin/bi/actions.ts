'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import {
  cacheStatus, facilitiesReport, invalidateBiCache, managementOverview, professorPanel, refreshAllBiCaches,
} from '@/lib/bi-engine';

function fail(err: unknown) {
  return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' } as const;
}

/** بازسازی آفلاین همهٔ کش‌های BI (معادل فراخوانی job زمان‌بندی‌شده) */
export async function biRefreshAction() {
  try {
    await requireRole(['ADMIN']);
    const res = await refreshAllBiCaches();
    revalidatePath('/admin/bi');
    if (!res.ok) return fail(new Error(res.error));
    return { ...res, ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

/** فقط داشبورد مدیریتی + تحلیل امکانات (سریع‌تر از بازسازی کامل) */
export async function biRefreshDashboardsAction() {
  try {
    await requireRole(['ADMIN']);
    const [overview, facilities] = await Promise.all([
      managementOverview({ force: true }),
      facilitiesReport({ force: true }),
    ]);
    revalidatePath('/admin/bi');
    return { ok: true as const, staff: overview.list.length, rooms: facilities.rooms.length };
  } catch (err) {
    return fail(err);
  }
}

/** پاک کردن کش (مثلاً پس از اصلاح پرسش‌نامه یا حذف پاسخ اشتباه) */
export async function biInvalidateAction(prefix?: string) {
  try {
    await requireRole(['ADMIN']);
    await invalidateBiCache(prefix);
    revalidatePath('/admin/bi');
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function biStatusAction() {
  try {
    await requireRole(['ADMIN']);
    return { ok: true as const, cache: await cacheStatus() };
  } catch (err) {
    return fail(err);
  }
}

export async function biProfessorPanelAction(staffId: number) {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT', 'DEPT_HEAD']);
    const panel = await professorPanel(staffId);
    return { ok: true as const, panel };
  } catch (err) {
    return fail(err);
  }
}

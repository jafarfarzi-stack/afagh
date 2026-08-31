'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import {
  ensureDefaultSanjeshMappings,
  importStagedToStudents,
  parseAndStageSanjeshData,
  registerManualStudent,
} from '@/lib/admissions-engine';
import { executeIrandocCheck } from '@/lib/api-integrations';
import { db } from '@/db';
import { admissions_staging, sanjesh_mappings, student_id_formulas } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function stageSanjeshDataAction(rawText: string, entryYear = 1405) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  try {
    const staged = await parseAndStageSanjeshData(rawText, entryYear);
    revalidatePath('/admin/admissions');
    revalidatePath('/admin/students');
    return { ok: true, count: staged.length, items: staged };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در پردازش فایل سنجش.' };
  }
}

export async function importStagedStudentsAction(stagingIds: number[]) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  try {
    const imported = await importStagedToStudents(stagingIds);
    revalidatePath('/admin/admissions');
    revalidatePath('/admin/students');
    return { ok: true, count: imported.length, items: imported };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در ثبت نهایی دانشجویان.' };
  }
}

export async function saveSanjeshMappingAction(sanjeshCode: string, internalMajorId: number, quota?: string) {
  await requireRole(['ADMIN']);

  try {
    const [existing] = await db
      .select()
      .from(sanjesh_mappings)
      .where(eq(sanjesh_mappings.sanjeshCode, sanjeshCode))
      .limit(1);

    if (existing) {
      await db
        .update(sanjesh_mappings)
        .set({ internalMajorId, sanjeshQuota: quota || 'سهمیه عادی' })
        .where(eq(sanjesh_mappings.id, existing.id));
    } else {
      await db.insert(sanjesh_mappings).values({
        sanjeshCode,
        internalMajorId,
        sanjeshQuota: quota || 'سهمیه عادی',
        internalQuotaCode: 1,
      });
    }

    // به‌روزرسانی رکوردهای staging متناظر که در حالت انتظار بودند
    await db
      .update(admissions_staging)
      .set({ mappedMajorId: internalMajorId, status: 'RESOLVED' })
      .where(eq(admissions_staging.status, 'PENDING_MAPPING'));

    revalidatePath('/admin/admissions');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در ذخیره نگاشت.' };
  }
}

export async function saveStudentIdFormulaAction(degreeLevelId: number, formula: string) {
  await requireRole(['ADMIN']);

  try {
    const [existing] = await db
      .select()
      .from(student_id_formulas)
      .where(eq(student_id_formulas.degreeLevelId, degreeLevelId))
      .limit(1);

    if (existing) {
      await db
        .update(student_id_formulas)
        .set({ formula })
        .where(eq(student_id_formulas.id, existing.id));
    } else {
      await db.insert(student_id_formulas).values({
        degreeLevelId,
        entryYear: 1405,
        formula,
        currentSequence: 0,
      });
    }

    revalidatePath('/admin/admissions');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در ذخیره فرمول شماره دانشجویی.' };
  }
}

export async function registerManualStudentAction(data: {
  nationalCode: string;
  firstName: string;
  lastName: string;
  mobile: string;
  majorId: number;
  degreeLevelId: number;
  entryYear?: number;
  quotaType?: string;
  admissionType?: 'NORMAL' | 'TRANSFER' | 'INTERNATIONAL' | 'FREE_COURSE';
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  try {
    const res = await registerManualStudent(data);
    revalidatePath('/admin/admissions');
    revalidatePath('/admin/students');
    return { ok: true, student: res };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در ثبت‌نام دستی دانشجو.' };
  }
}

export async function testIrandocCheckAction(params: {
  nationalCode: string;
  trackingCode: string;
  thesisTitle: string;
  maxAllowedThreshold?: number;
}) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  try {
    const res = await executeIrandocCheck(params);
    revalidatePath('/admin/admissions');
    revalidatePath('/admin/workflows');
    return { ok: true, result: res };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'خطا در استعلام ایرانداک.' };
  }
}

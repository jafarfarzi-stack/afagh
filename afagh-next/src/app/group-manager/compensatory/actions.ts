'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { students } from '@/db/schema';
import { requireDepHead } from '@/lib/group-manager';
import { assertServerActionOrigin } from '@/lib/security';

export async function saveCompensatoryAction(formData: FormData): Promise<void> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return;
  const { depts } = await requireDepHead();
  const deptIds = depts.map(d => d.id);

  const studentId = Number(formData.get('studentId'));
  if (!Number.isInteger(studentId) || studentId <= 0) return;

  // محدودیت دامنه: دانشجو باید به یکی از گروه‌های مدیر تعلق داشته باشد
  const [stu] = await db.select({ id: students.id, majorId: students.majorId })
    .from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu || stu.majorId == null) return;
  // بررسی گروه از طریق majors (import نشده تا سبک بماند) — با یک کوئری ساده
  const { majors } = await import('@/db/schema');
  const [maj] = await db.select({ departmentId: majors.departmentId })
    .from(majors).where(eq(majors.id, stu.majorId)).limit(1);
  if (!maj || maj.departmentId == null || !deptIds.includes(maj.departmentId)) return;

  const previousMajorCode = String(formData.get('previousMajorCode') ?? '').trim() || null;
  const previousMajorTitle = String(formData.get('previousMajorTitle') ?? '').trim() || null;
  const relRaw = String(formData.get('previousMajorRelation') ?? '').trim();
  const previousMajorRelation = ['RELATED', 'PARTIAL', 'UNRELATED'].includes(relRaw) ? relRaw : null;
  const unitsRaw = Number(formData.get('compensatoryUnits'));
  const compensatoryUnits = Number.isFinite(unitsRaw) && unitsRaw >= 0 ? Math.round(unitsRaw) : 0;
  const honorsRaw = String(formData.get('honorsOverride') ?? '').trim();
  const honorsOverride = honorsRaw === '' ? null : (honorsRaw === '1' ? 1 : 0);

  await db.update(students).set({
    previousMajorCode, previousMajorTitle, previousMajorRelation,
    compensatoryUnits, honorsOverride,
  }).where(eq(students.id, studentId));

  revalidatePath('/group-manager/compensatory');
}

export async function bulkCompensatoryAction(formData: FormData): Promise<void> {
  const og = await assertServerActionOrigin();
  if (!og.ok) return;
  const { depts } = await requireDepHead();
  const deptIds = depts.map(d => d.id);

  const year = Number(formData.get('year'));
  const unitsRaw = Number(formData.get('units'));
  const units = Number.isFinite(unitsRaw) && unitsRaw >= 0 ? Math.round(unitsRaw) : 0;
  if (!Number.isInteger(year)) return;

  const { majors } = await import('@/db/schema');
  const majorsInScope = deptIds.length
    ? await db.select({ id: majors.id }).from(majors).where(inArray(majors.departmentId, deptIds))
    : [];
  const majorIds = majorsInScope.map(m => m.id);
  if (majorIds.length === 0) return;

  await db.update(students).set({ compensatoryUnits: units })
    .where(and(
      inArray(students.majorId, majorIds),
      eq(students.entryYear, year),
      eq(students.previousMajorRelation, 'UNRELATED'),
    ));

  revalidatePath('/group-manager/compensatory');
}

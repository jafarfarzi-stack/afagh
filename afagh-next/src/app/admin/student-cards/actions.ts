'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { issueStudentCard, revokeStudentCard } from '@/lib/verification';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'student-cards' });

/** دانشجو باید متعلق به دانشگاه فعال باشد */
async function assertStudentInUni(studentId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
  const [s] = await db.select({ universityId: students.universityId })
    .from(students).where(eq(students.id, studentId)).limit(1);
  if (!s) return { ok: false, error: 'دانشجو یافت نشد.' };
  if (s.universityId !== null && s.universityId !== uni.id) {
    return { ok: false, error: 'دانشجو متعلق به دانشگاه دیگری است.' };
  }
  return { ok: true };
}

/** صدور یا تمدید کارت دانشجویی — توکن تصادفی ۴۸ کاراکتری در پایگاه داده */
export async function issueCardAction(studentId: number, forceNewToken: boolean) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const scope = await assertStudentInUni(Number(studentId));
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const res = await issueStudentCard(Number(studentId), { force: !!forceNewToken });
  revalidatePath('/admin/student-cards');
  return { ok: true as const, token: res.token, renewed: res.renewed };
}

/** باطل‌سازی / اعلام مفقودی کارت */
export async function revokeCardAction(studentId: number, status: 'REVOKED' | 'LOST') {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const scope = await assertStudentInUni(Number(studentId));
  if (!scope.ok) return { ok: false as const, error: scope.error };
  await revokeStudentCard(Number(studentId), status);
  log.info('student_card_revoked', { studentId: Number(studentId), status });
  revalidatePath('/admin/student-cards');
  return { ok: true as const };
}

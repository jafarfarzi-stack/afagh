'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { issueStudentCard, revokeStudentCard } from '@/lib/verification';
import { createLogger } from '@/lib/logger';

const log = createLogger({ mod: 'student-cards' });

/** صدور یا تمدید کارت دانشجویی — توکن تصادفی ۴۸ کاراکتری در پایگاه داده */
export async function issueCardAction(studentId: number, forceNewToken: boolean) {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const res = await issueStudentCard(Number(studentId), { force: !!forceNewToken });
  revalidatePath('/admin/student-cards');
  return { ok: true as const, token: res.token, renewed: res.renewed };
}

/** باطل‌سازی / اعلام مفقودی کارت */
export async function revokeCardAction(studentId: number, status: 'REVOKED' | 'LOST') {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  await revokeStudentCard(Number(studentId), status);
  log.info('student_card_revoked', { studentId: Number(studentId), status });
  revalidatePath('/admin/student-cards');
  return { ok: true as const };
}

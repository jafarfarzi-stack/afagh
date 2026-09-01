'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { document_categories, graduation_audits, students } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getStudentTracker, payStampFee, setFinalPhoto } from '@/lib/graduation-engine';

// ═══ تنها کنش‌هایی که از خودِ دانشجو خواسته می‌شود ═══
// (بارگذاری عکس ۴×۳ و پرداخت تمبر ابطال) — بقیهٔ مراحل خودکار است.

async function me() {
  const user = await requireRole(['STUDENT']);
  const [s] = await db.select({ id: students.id }).from(students).where(eq(students.userId, user.id)).limit(1);
  if (!s) throw new Error('پروندهٔ دانشجویی یافت نشد.');
  return { user, studentId: s.id };
}

async function ownAudit(studentId: number, auditId: number) {
  const [a] = await db.select({ id: graduation_audits.id }).from(graduation_audits)
    .where(eq(graduation_audits.id, auditId)).limit(1);
  const [own] = await db.select({ id: graduation_audits.id }).from(graduation_audits)
    .where(eq(graduation_audits.studentId, studentId)).limit(1);
  if (!a || !own || a.id !== own.id) throw new Error('دسترسی به این پرونده مجاز نیست.');
}

/** شناسهٔ دستهٔ «عکس پرسنلی» برای بارگذاری در بایگانی الکترونیکی */
export async function photoCategoryAction() {
  await me();
  const title = 'عکس پرسنلی';
  const [found] = await db.select().from(document_categories).where(eq(document_categories.title, title)).limit(1);
  if (found) return { ok: true as const, categoryId: found.id };
  const [ins] = await db.insert(document_categories).values({ title, scope: 'STUDENT' }).returning({ id: document_categories.id });
  return { ok: true as const, categoryId: ins.id };
}

export async function trackerAction() {
  const { studentId } = await me();
  return { ok: true as const, tracker: await getStudentTracker(studentId) };
}

export async function attachPhotoAction(auditId: number, documentId: number) {
  const { studentId } = await me();
  try {
    await ownAudit(studentId, auditId);
    await setFinalPhoto(auditId, documentId);
    revalidatePath('/student/graduation');
    return { ok: true as const, tracker: await getStudentTracker(studentId) };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'خطا' }; }
}

export async function payStampAction(auditId: number) {
  const { user, studentId } = await me();
  try {
    await ownAudit(studentId, auditId);
    await payStampFee(auditId, user.id);
    revalidatePath('/student/graduation');
    return { ok: true as const, tracker: await getStudentTracker(studentId) };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'خطا' }; }
}

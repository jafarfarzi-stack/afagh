'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, withUserRls } from '@/db';
import { document_categories, graduation_audits, student_documents } from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import {
  getThesisProgress,
  requestDefense,
  runFinalIrandocCheck,
  submitFinalThesis,
  submitProposal,
  submitThesisTitleAndSupervisor,
} from '@/lib/graduation-engine';

// ═══ کنش‌های دانشجو در چرخهٔ پایان‌نامه (فاز ۱ تا ۳) ═══
// هیچ‌جا auditId از کلاینت گرفته نمی‌شود: پرونده از خودِ نشست استخراج می‌شود.

const PATH = '/student/thesis-proposal';
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'خطای نامشخص' });

/**
 * پروندهٔ فارغ‌التحصیلی خودِ کاربر جاری — از نشست و RLS استخراج می‌شود،
 * نه از آرگومان کلاینت؛ بنابراین دانشجو فقط روی پروندهٔ خودش عمل می‌کند.
 */
async function ownAudit() {
  const user = await requireRole(['STUDENT']);
  const me = await getStudentByUser(user.id);
  if (!me) throw new Error('پروندهٔ دانشجویی یافت نشد.');
  const [row] = await withUserRls(user.id, tx =>
    tx
      .select({ id: graduation_audits.id, workflowStatus: graduation_audits.workflowStatus })
      .from(graduation_audits)
      .where(eq(graduation_audits.studentId, me.id))
      .limit(1));
  if (!row) throw new Error('پروندهٔ فارغ‌التحصیلی شما هنوز باز نشده است.');
  return { userId: user.id, studentId: me.id, auditId: row.id, workflowStatus: row.workflowStatus };
}

/** شناسهٔ فایل باید به سند بارگذاری‌شدهٔ خودِ همین دانشجو تعلق داشته باشد */
async function ownDocument(userId: number, docId: number, label: string) {
  const [doc] = await db
    .select({ id: student_documents.id })
    .from(student_documents)
    .where(and(eq(student_documents.id, docId), eq(student_documents.personUserId, userId)))
    .limit(1);
  if (!doc) throw new Error(`${label} یافت نشد؛ فایل را دوباره بارگذاری کنید.`);
  return doc.id;
}

/** دستهٔ بایگانی برای بارگذاری فایل (همان الگوی عکس پرسنلی) */
export async function documentCategoryAction(title: string) {
  try {
    await ownAudit();
    const [found] = await db.select().from(document_categories).where(eq(document_categories.title, title)).limit(1);
    if (found) return { ok: true as const, categoryId: found.id };
    const [ins] = await db
      .insert(document_categories)
      .values({ title, scope: 'STUDENT' })
      .returning({ id: document_categories.id });
    return { ok: true as const, categoryId: ins.id };
  } catch (e) { return fail(e); }
}

export async function thesisProgressAction() {
  try {
    const { auditId } = await ownAudit();
    return { ok: true as const, progress: await getThesisProgress(auditId) };
  } catch (e) { return fail(e); }
}

/** فاز ۱ — ثبت استاد راهنما و عنوان اولیه (به‌همراه استعلام پیشینهٔ ایرانداک) */
export async function submitTitleAndSupervisorAction(input: {
  supervisorId: number;
  advisorId?: number | null;
  titleFa: string;
  titleEn?: string;
  keywords?: string;
  abstract?: string;
}) {
  try {
    const { auditId } = await ownAudit();
    const supervisorId = Number(input.supervisorId);
    const titleFa = (input.titleFa ?? '').trim();
    if (!Number.isInteger(supervisorId) || supervisorId <= 0) return { ok: false as const, error: 'استاد راهنما را انتخاب کنید.' };
    if (titleFa.length < 10) return { ok: false as const, error: 'عنوان پایان‌نامه را کامل وارد کنید.' };

    const advisorId = Number(input.advisorId) > 0 ? Number(input.advisorId) : undefined;
    const r = await submitThesisTitleAndSupervisor({
      auditId,
      supervisorId,
      advisorId,
      titleFa,
      titleEn: input.titleEn?.trim() || undefined,
      keywords: input.keywords?.trim() || undefined,
      abstract: input.abstract?.trim() || undefined,
    });
    revalidatePath(PATH);
    revalidatePath('/student/graduation');
    return {
      ok: true as const,
      priorStatus: r.priorStatus,
      priorSimilarity: Number(r.priorSim ?? 0),
      progress: await getThesisProgress(auditId),
    };
  } catch (e) { return fail(e); }
}

/** فاز ۲ — بارگذاری فایل پروپوزال و محاسبهٔ همانندجویی */
export async function submitProposalAction(fileId: number) {
  try {
    const { auditId, userId } = await ownAudit();
    const docId = await ownDocument(userId, Number(fileId), 'فایل پروپوزال');
    const r = await submitProposal({ auditId, fileId: docId });
    revalidatePath(PATH);
    return { ok: true as const, similarity: Number(r.similarity ?? 0), progress: await getThesisProgress(auditId) };
  } catch (e) { return fail(e); }
}

/** فاز ۳ — ثبت درخواست دفاع (پس از تأیید پروپوزال و بارگذاری در ایرانداک) */
export async function requestDefenseAction() {
  try {
    const { auditId } = await ownAudit();
    await requestDefense({ auditId });
    revalidatePath(PATH);
    return { ok: true as const, progress: await getThesisProgress(auditId) };
  } catch (e) { return fail(e); }
}

/** فاز ۳ — بارگذاری پایان‌نامهٔ نهایی پس از دفاع موفق */
export async function submitFinalThesisAction(fileId: number) {
  try {
    const { auditId, userId } = await ownAudit();
    const docId = await ownDocument(userId, Number(fileId), 'فایل پایان‌نامهٔ نهایی');
    await submitFinalThesis({ auditId, fileId: docId });
    revalidatePath(PATH);
    return { ok: true as const, progress: await getThesisProgress(auditId) };
  } catch (e) { return fail(e); }
}

/** استعلام همانندجویی پایان‌نامهٔ نهایی با کد رهگیری بارگذاری در ایرانداک */
export async function finalIrandocCheckAction(trackingCode: string) {
  try {
    const { auditId } = await ownAudit();
    const code = (trackingCode ?? '').trim();
    if (code.length < 4) return { ok: false as const, error: 'کد رهگیری ایرانداک را کامل وارد کنید.' };
    const r = await runFinalIrandocCheck({ auditId, trackingCode: code });
    revalidatePath(PATH);
    revalidatePath('/student/graduation');
    return {
      ok: true as const,
      passed: r.passed,
      similarity: Number(r.similarity ?? 0),
      progress: await getThesisProgress(auditId),
    };
  } catch (e) { return fail(e); }
}
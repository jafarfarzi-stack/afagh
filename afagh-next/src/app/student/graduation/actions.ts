'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { document_categories, graduation_audits } from '@/db/schema';
import { getStudentByUser, requireRole } from '@/lib/auth';
import { getStudentTracker, payStampFee, setFinalPhoto, submitSajjadRequest } from '@/lib/graduation-engine';
import { activeChannels, listUserChannels, saveUserChannel, sendTestMessage, type Channel } from '@/lib/messaging';

// ═══ تنها کنش‌هایی که از خودِ دانشجو خواسته می‌شود ═══
// (بارگذاری عکس ۴×۳ و پرداخت تمبر ابطال) — بقیهٔ مراحل خودکار است.

async function me() {
  const user = await requireRole(['STUDENT']);
  // getStudentByUser خودترمیم دارد: برای حساب دمو بدون رکورد، پرونده همان‌جا ساخته می‌شود
  const s = await getStudentByUser(user.id);
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

/** کانال‌های اطلاع‌رسانی فعال سامانه + نشانی ثبت‌شدهٔ خود دانشجو */
export async function myChannelsAction() {
  const { user } = await me();
  const rows = await listUserChannels(user.id);
  return {
    ok: true as const,
    active: await activeChannels(),
    mine: rows.map(r => ({ channel: r.channel, address: r.address })),
  };
}

export async function saveChannelAction(channel: string, address: string) {
  const { user } = await me();
  try {
    await saveUserChannel(user.id, channel as Channel, address);
    revalidatePath('/student/graduation');
    const rows = await listUserChannels(user.id);
    return { ok: true as const, mine: rows.map(r => ({ channel: r.channel, address: r.address })) };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'خطا' }; }
}

export async function testChannelAction(channel: string) {
  const { user } = await me();
  try {
    const r = await sendTestMessage(user.id, channel as Channel);
    return { ok: true as const, status: r.status, error: 'error' in r ? r.error : undefined };
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'خطا' }; }
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

/** ثبت کد رهگیری درخواست «کد صحت» که دانشجو در سامانهٔ سجاد گرفته است */
export async function submitSajjadAction(auditId: number, code: string) {
  const { studentId } = await me();
  try {
    await ownAudit(studentId, auditId);
    await submitSajjadRequest(auditId, code);
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

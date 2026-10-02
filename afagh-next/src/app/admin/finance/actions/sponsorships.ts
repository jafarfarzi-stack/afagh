'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_sponsorships, tuition_sponsors } from '@/db/schema';
import { requireRole, getSessionUser } from '@/lib/auth';
import { assertServerActionOrigin, requireStudentScope } from '@/lib/security';
import { appendAudit } from '@/lib/audit';
import { FINANCE, clean, money, num, revalidateStudent } from './shared';

// ══════════════════════════════════════════════════════════════════════
//  پوشش بنیادها
// ══════════════════════════════════════════════════════════════════════

export async function addSponsorshipAction(input: {
  studentId: number;
  termId: number | null;
  sponsorId: number;
  coverageKind: string;
  percent: number;
  amount: number;
  appliesTo: string;
  referenceNo: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const sc = await requireStudentScope(input.studentId);
  if (!sc.ok) return { ok: false, error: sc.error };

  const [sponsor] = await db.select().from(tuition_sponsors)
    .where(eq(tuition_sponsors.id, input.sponsorId)).limit(1);
  if (!sponsor) return { ok: false, error: 'بنیاد یافت نشد' };

  const user = await getSessionUser();
  try {
    return await db.transaction(async (tx) => {
      // 🔒 وضعیت کاملاً سمت سرور: پوششِ بنیاد همیشه ابتدا PENDING است (تأیید ناظر بنیاد
      // یا کارشناس، جداگانه انجام می‌شود) — کلاینت حق تعیین وضعیت ندارد.
      const [ins] = await tx.insert(student_sponsorships).values({
        studentId: input.studentId,
        termId: input.termId,
        sponsorId: input.sponsorId,
        coverageKind: input.coverageKind === 'FIXED' ? 'FIXED' : 'PERCENT',
        percent: String(Math.min(Math.max(0, num(input.percent)), 100)),
        amount: money(input.amount),
        appliesTo: input.appliesTo || 'BOTH',
        referenceNo: clean(input.referenceNo),
        status: 'PENDING',
      }).returning({ id: student_sponsorships.id });
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_SPONSORSHIP_ADDED_PENDING',
        entityType: 'student_sponsorships',
        entityId: ins.id,
        details: JSON.stringify({ studentId: input.studentId, sponsorId: input.sponsorId }),
      });
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ثبت پوشش' };
  }
}

export async function setSponsorshipStatusAction(
  id: number,
  status: 'CONFIRMED' | 'PAID' | 'REJECTED'
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_sponsorships).where(eq(student_sponsorships.id, id)).limit(1);
      if (!row) return { ok: false, error: 'پوشش یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      const allowed = status === 'REJECTED' ? row.status === 'PENDING' : ['PENDING', 'CONFIRMED'].includes(row.status);
      if (!allowed) return { ok: false, error: 'انتقال نامعتبر: پوشش فقط از «در انتظار» تأیید/پرداخت می‌شود؛ «ردشده» پایانی است.' };

      const upd = await tx.update(student_sponsorships).set({ status })
        .where(and(eq(student_sponsorships.id, id), eq(student_sponsorships.status, row.status)));
      if (upd.rowCount !== 1) return { ok: false, error: 'تغییر همزمان — دوباره تلاش کنید.' };

      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: `FINANCE_SPONSORSHIP_${status}`,
        entityType: 'student_sponsorships',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, from: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در تغییر وضعیت پوشش' };
  }
}

export async function deleteSponsorshipAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const user = await getSessionUser();

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(student_sponsorships).where(eq(student_sponsorships.id, id)).limit(1);
      if (!row) return { ok: false, error: 'پوشش یافت نشد' };
      // 🔒 Object-Level (بازبینی ۴): رکورد با id پیدا شد — حالا تعلق دانشجو سنجیده می‌شود
      const sc = await requireStudentScope(row.studentId);
      if (!sc.ok) return { ok: false, error: sc.error };
      // 🔒 پوششِ اثر مالی‌دار (CONFIRMED/PAID) حذف‌ناپذیر است
      if (row.status === 'CONFIRMED' || row.status === 'PAID') {
        return { ok: false, error: 'پوشش تأییدشده/پرداخت‌شده در شهریه اثر دارد — قابل حذف نیست؛ ابتدا ردش کنید.' };
      }
      await tx.delete(student_sponsorships).where(eq(student_sponsorships.id, id));
      await appendAudit(tx, {
        actorUserId: user?.id ?? null,
        action: 'FINANCE_SPONSORSHIP_DELETED',
        entityType: 'student_sponsorships',
        entityId: id,
        details: JSON.stringify({ studentId: row.studentId, wasStatus: row.status }),
      });
      revalidateStudent(row.studentId);
      return { ok: true };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در حذف پوشش' };
  }
}

export async function saveSponsorAction(input: {
  id?: number;
  code: string;
  title: string;
  contactInfo: string;
  settlementMethod: string;
  isActive: boolean;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };

  const code = clean(input.code);
  const title = clean(input.title);
  if (!code || !title) return { ok: false, error: 'کد و عنوان الزامی است' };

  const values = {
    code,
    title,
    contactInfo: clean(input.contactInfo),
    settlementMethod: input.settlementMethod === 'REIMBURSE' ? 'REIMBURSE' : 'DIRECT',
    isActive: input.isActive ? 1 : 0,
    note: clean(input.note),
  };

  if (input.id) {
    await db.update(tuition_sponsors).set(values).where(eq(tuition_sponsors.id, input.id));
  } else {
    await db.insert(tuition_sponsors).values(values);
  }

  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

export async function deleteSponsorAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  const og = await assertServerActionOrigin();
  if (!og.ok) return { ok: false, error: og.error };
  const used = await db.select({ id: student_sponsorships.id }).from(student_sponsorships)
    .where(eq(student_sponsorships.sponsorId, id)).limit(1);
  if (used.length) return { ok: false, error: 'این بنیاد پوشش ثبت‌شده دارد؛ به‌جای حذف، غیرفعالش کنید' };

  await db.delete(tuition_sponsors).where(eq(tuition_sponsors.id, id));
  revalidatePath('/admin/finance/rules');
  return { ok: true };
}

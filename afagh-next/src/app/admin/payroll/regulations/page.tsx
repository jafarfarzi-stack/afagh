import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { db } from '@/db';
import { desc, eq } from 'drizzle-orm';
import { payroll_regulation_versions } from '@/db/schema-payroll-plus';
import RegulationsClient from './RegulationsClient';

export const dynamic = 'force-dynamic';

export default async function RegulationsPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT', 'VICE_EDU', 'FINANCE']);
  const uni = await getCurrentUniversity().catch(() => null);
  const universityId = uni?.id ?? null;

  const rows = await db
    .select()
    .from(payroll_regulation_versions)
    .where(universityId == null ? undefined : eq(payroll_regulation_versions.universityId, universityId))
    .orderBy(desc(payroll_regulation_versions.createdAt))
    .limit(100);

  async function createAction(input: { code: string; title: string; year: number | null; description: string | null }) {
    'use server';
    try {
      await requireRole(['ADMIN']);
      const u = await getCurrentUniversity().catch(() => null);
      const code = input.code.trim();
      const title = input.title.trim();
      if (code.length < 2 || title.length < 2) return { ok: false as const, error: 'کد و عنوان الزامی‌اند.' };
      const dup = await db
        .select({ id: payroll_regulation_versions.id })
        .from(payroll_regulation_versions)
        .where(eq(payroll_regulation_versions.code, code))
        .limit(1);
      if (dup.length) return { ok: false as const, error: 'این کد نسخه قبلاً ثبت شده است.' };
      const [row] = await db
        .insert(payroll_regulation_versions)
        .values({ code, title, year: input.year, description: input.description, isActive: 0, universityId: u?.id ?? null })
        .returning({ id: payroll_regulation_versions.id });
      return { ok: true as const, id: row.id };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function activateAction(id: number) {
    'use server';
    try {
      await requireRole(['ADMIN']);
      const u = await getCurrentUniversity().catch(() => null);
      const uid = u?.id ?? null;
      // فقط یک نسخه فعال در هر دانشگاه
      await db
        .update(payroll_regulation_versions)
        .set({ isActive: 0 })
        .where(uid == null ? undefined : eq(payroll_regulation_versions.universityId, uid));
      await db
        .update(payroll_regulation_versions)
        .set({ isActive: 1 })
        .where(eq(payroll_regulation_versions.id, id));
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  async function deleteAction(id: number) {
    'use server';
    try {
      await requireRole(['ADMIN']);
      const [row] = await db
        .select({ isActive: payroll_regulation_versions.isActive })
        .from(payroll_regulation_versions)
        .where(eq(payroll_regulation_versions.id, id))
        .limit(1);
      if (!row) return { ok: false as const, error: 'نسخه یافت نشد.' };
      if (Number(row.isActive ?? 0) === 1) return { ok: false as const, error: 'نسخهٔ فعال حذف نمی‌شود؛ ابتدا نسخهٔ دیگری را فعال کنید.' };
      await db.delete(payroll_regulation_versions).where(eq(payroll_regulation_versions.id, id));
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
    }
  }

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <RegulationsClient
        initial={rows.map(r => ({
          id: r.id,
          code: r.code,
          title: r.title,
          year: r.year,
          description: r.description,
          isActive: Number(r.isActive ?? 0),
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        }))}
        actions={{ createAction, activateAction, deleteAction }}
      />
    </div>
  );
}

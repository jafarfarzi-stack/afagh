import { revalidatePath } from 'next/cache';
import { eq, isNull, or } from 'drizzle-orm';
import { safeRials } from '@/lib/money';

export const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];
export const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' || s === 'null' || s === 'undefined' ? null : s;
};
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const intOrNull = (v: unknown): number | null => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
/**
 * 🔒 پولِ صحیح (بازبینی — Medium): مبلغ همیشه «عدد صحیح ریال» اعتبارسنجی و ذخیره
 * می‌شود (safeRials) — نه float. ورودی نامعتبر → null → خطای صریح.
 */
export const money = (v: unknown): string => {
  const r = safeRials(v);
  if (r === null) throw new Error('مبلغ نامعتبر است (می‌بایست عدد صحیح ریال باشد).');
  return String(r);
};

export function revalidateStudent(studentId: number) {
  revalidatePath('/admin/finance');
  revalidatePath(`/admin/finance/student/${studentId}`);
}

// ─── University scope (afagh_uni) ───

/** دانشگاه فعال سرور */
export async function currentUni() {
  const { getCurrentUniversity } = await import('@/lib/university-scope');
  return getCurrentUniversity().catch(() => null);
}

/** شرط match-or-null برای فهرست‌ها */
export function uniScopeOf(col: any, uniId: number | null | undefined) {
  if (!uniId) return undefined;
  return or(eq(col, uniId), isNull(col));
}

/** دانشجو باید متعلق به دانشگاه فعال باشد */
export async function requireStudentUni(
  studentId: number,
): Promise<{ ok: true; uniId: number } | { ok: false; error: string }> {
  const { db } = await import('@/db');
  const { students } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const uni = await currentUni();
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
  const [s] = await db
    .select({ universityId: students.universityId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!s) return { ok: false, error: 'دانشجو یافت نشد.' };
  if (s.universityId !== null && s.universityId !== uni.id) {
    return { ok: false, error: 'دانشجو متعلق به دانشگاه دیگری است.' };
  }
  return { ok: true, uniId: uni.id };
}

/** رکورد مرجع/مالی باید متعلق به دانشگاه فعال (یا سراسری) باشد */
export async function assertRowUni(
  tbl: any,
  id: number,
): Promise<{ ok: true; uniId: number } | { ok: false; error: string }> {
  const { db } = await import('@/db');
  const { eq } = await import('drizzle-orm');
  const uni = await currentUni();
  if (!uni) return { ok: false, error: 'دانشگاه فعال نامشخص است.' };
  const [r] = await db.select({ u: tbl.universityId }).from(tbl).where(eq(tbl.id, id)).limit(1);
  if (!r) return { ok: false, error: 'رکورد یافت نشد.' };
  if (r.u !== null && r.u !== uni.id) {
    return { ok: false, error: 'رکورد متعلق به دانشگاه دیگری است.' };
  }
  return { ok: true, uniId: uni.id };
}

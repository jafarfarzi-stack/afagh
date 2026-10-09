import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms,
  payroll_duty_roles,
  professor_term_contracts,
  staff,
  staff_term_roles,
} from '@/db/schema';

// ══════════════════════════════════════════════════════════════════════
//  کاتالوگ سمت‌های موظفی + انتساب ترمی + محاسبهٔ موظفی مؤثر
//
//  قاعدهٔ مالک مالی (عیناً):
//    موظفی از «نقش» استاد می‌آید نه مرتبهٔ علمی.
//    موظفی مؤثر = dutyUnits نقشِ تدریسیِ اصلی (اولین برحسب sortOrder میان
//    نقش‌های تدریسیِ منتسب) منهای Σ reductionUnits همهٔ نقش‌های منتسب، کفِ صفر.
//    بدون نقش تدریسیِ منتسب ← بازگشت به baseDutyUnits قدیمی (سازگار با گذشته).
// ══════════════════════════════════════════════════════════════════════

export type DutyRole = typeof payroll_duty_roles.$inferSelect;

export type StaffTermRole = {
  assignmentId: number;
  roleId: number;
  code: string;
  title: string;
  dutyUnits: number | null;
  reductionUnits: number;
  isTeaching: boolean;
  sortOrder: number;
  isPrimary: boolean;
};

/** فهرست سمت‌های یک دانشگاه (مرتب برحسب sortOrder) */
export async function listDutyRoles(universityId: number | null): Promise<DutyRole[]> {
  const rows = await db.select().from(payroll_duty_roles).orderBy(payroll_duty_roles.sortOrder);
  return universityId == null
    ? rows.filter(r => r.universityId == null)
    : rows.filter(r => r.universityId === universityId);
}

/** ساخت سمت جدید (اعتبارسنجی سمت‌سرور) */
export async function createDutyRole(input: {
  universityId: number | null;
  code: string;
  title: string;
  dutyUnits: number | null;
  reductionUnits: number;
  isTeaching: boolean;
  sortOrder: number;
}): Promise<DutyRole> {
  const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
  if (!/^[A-Z0-9_]{2,40}$/.test(code)) throw new Error('کد سمت باید ۲ تا ۴۰ نویسهٔ لاتین/عدد/زیرخط باشد.');
  const title = input.title.trim();
  if (title.length < 2 || title.length > 150) throw new Error('عنوان سمت باید ۲ تا ۱۵۰ نویسه باشد.');
  if (input.dutyUnits != null && !(input.dutyUnits >= 0 && input.dutyUnits <= 40)) {
    throw new Error('موظفی باید بین ۰ تا ۴۰ باشد (یا خالی).');
  }
  if (!(input.reductionUnits >= 0 && input.reductionUnits <= 40)) {
    throw new Error('کسر موظفی باید بین ۰ تا ۴۰ باشد.');
  }
  const [row] = await db.insert(payroll_duty_roles).values({
    universityId: input.universityId,
    code,
    title,
    dutyUnits: input.dutyUnits == null ? null : String(input.dutyUnits),
    reductionUnits: String(input.reductionUnits),
    isTeaching: input.isTeaching ? 1 : 0,
    sortOrder: Math.trunc(input.sortOrder) || 0,
  }).returning();
  return row;
}

/** ویرایش سمت (فقط فیلدهای عددی/عنوان — کد ثابت می‌ماند) */
export async function updateDutyRole(
  id: number,
  universityId: number | null,
  patch: { title: string; dutyUnits: number | null; reductionUnits: number; isTeaching: boolean; sortOrder: number },
): Promise<void> {
  const title = patch.title.trim();
  if (title.length < 2 || title.length > 150) throw new Error('عنوان سمت باید ۲ تا ۱۵۰ نویسه باشد.');
  if (patch.dutyUnits != null && !(patch.dutyUnits >= 0 && patch.dutyUnits <= 40)) {
    throw new Error('موظفی باید بین ۰ تا ۴۰ باشد (یا خالی).');
  }
  if (!(patch.reductionUnits >= 0 && patch.reductionUnits <= 40)) {
    throw new Error('کسر موظفی باید بین ۰ تا ۴۰ باشد.');
  }
  const cond = universityId == null
    ? and(eq(payroll_duty_roles.id, id))
    : and(eq(payroll_duty_roles.id, id), eq(payroll_duty_roles.universityId, universityId));
  await db.update(payroll_duty_roles).set({
    title,
    dutyUnits: patch.dutyUnits == null ? null : String(patch.dutyUnits),
    reductionUnits: String(patch.reductionUnits),
    isTeaching: patch.isTeaching ? 1 : 0,
    sortOrder: Math.trunc(patch.sortOrder) || 0,
  }).where(cond as never);
}

/** حذف سمت (انتساب‌هایش با cascade پاک می‌شوند) */
export async function deleteDutyRole(id: number, universityId: number | null): Promise<void> {
  const cond = universityId == null
    ? eq(payroll_duty_roles.id, id)
    : and(eq(payroll_duty_roles.id, id), eq(payroll_duty_roles.universityId, universityId));
  await db.delete(payroll_duty_roles).where(cond as never);
}

/** نقش‌های منتسب به یک استاد در یک ترم */
export async function listStaffTermRoles(staffId: number, termId: number): Promise<StaffTermRole[]> {
  const rows = await db
    .select({
      assignmentId: staff_term_roles.id,
      roleId: payroll_duty_roles.id,
      code: payroll_duty_roles.code,
      title: payroll_duty_roles.title,
      dutyUnits: payroll_duty_roles.dutyUnits,
      reductionUnits: payroll_duty_roles.reductionUnits,
      isTeaching: payroll_duty_roles.isTeaching,
      sortOrder: payroll_duty_roles.sortOrder,
      isPrimary: staff_term_roles.isPrimary,
    })
    .from(staff_term_roles)
    .innerJoin(payroll_duty_roles, eq(payroll_duty_roles.id, staff_term_roles.roleId))
    .where(and(eq(staff_term_roles.staffId, staffId), eq(staff_term_roles.termId, termId)));
  return rows.map(r => ({
    assignmentId: r.assignmentId,
    roleId: r.roleId,
    code: r.code,
    title: r.title,
    dutyUnits: r.dutyUnits == null ? null : Number(r.dutyUnits),
    reductionUnits: Number(r.reductionUnits ?? 0),
    isTeaching: Number(r.isTeaching ?? 0) === 1,
    sortOrder: Number(r.sortOrder ?? 0),
    isPrimary: Number(r.isPrimary ?? 0) === 1,
  }));
}

/** انتساب نقش به استاد در ترم (idempotent: تکراری خطا نمی‌دهد) */
export async function assignStaffTermRole(
  staffId: number, termId: number, roleId: number, isPrimary: boolean,
): Promise<void> {
  if (!Number.isInteger(staffId) || staffId <= 0) throw new Error('شناسهٔ استاد نامعتبر است.');
  if (!Number.isInteger(termId) || termId <= 0) throw new Error('شناسهٔ ترم نامعتبر است.');
  const [st] = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, staffId)).limit(1);
  if (!st) throw new Error('استاد یافت نشد.');
  const [tm] = await db.select({ id: academic_terms.id }).from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!tm) throw new Error('ترم یافت نشد.');
  const [rl] = await db.select({ id: payroll_duty_roles.id }).from(payroll_duty_roles).where(eq(payroll_duty_roles.id, roleId)).limit(1);
  if (!rl) throw new Error('سمت یافت نشد.');
  const existing = await db.select({ id: staff_term_roles.id })
    .from(staff_term_roles)
    .where(and(
      eq(staff_term_roles.staffId, staffId),
      eq(staff_term_roles.termId, termId),
      eq(staff_term_roles.roleId, roleId),
    )).limit(1);
  if (existing[0]) {
    await db.update(staff_term_roles)
      .set({ isPrimary: isPrimary ? 1 : 0 })
      .where(eq(staff_term_roles.id, existing[0].id));
    return;
  }
  await db.insert(staff_term_roles).values({
    staffId, termId, roleId, isPrimary: isPrimary ? 1 : 0,
  });
}

/** حذف یک انتساب */
export async function unassignStaffTermRole(assignmentId: number): Promise<void> {
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) throw new Error('شناسهٔ انتساب نامعتبر است.');
  await db.delete(staff_term_roles).where(eq(staff_term_roles.id, assignmentId));
}

/**
 * موظفی مؤثر یک استاد در یک ترم (فرمول مالک مالی، عیناً):
 *   teaching = نقش‌های منتسب با isTeaching=1، مرتب برحسب sortOrder؛
 *   base = dutyUnits اولین نقش تدریسی (sortOrder کمترین) که dutyUnits غیرتهی دارد
 *          (اگر هیچ‌کدام dutyUnits نداشتند ← ۰)؛
 *   effective = max(0, base − Σ reductionUnits همهٔ نقش‌های منتسب).
 *   اگر هیچ نقش تدریسی منتسب نباشد ← null (فراخوان باید به baseDutyUnits قدیمی برگردد).
 */
export function computeEffectiveDuty(assigned: Pick<StaffTermRole, 'dutyUnits' | 'reductionUnits' | 'isTeaching' | 'sortOrder'>[]): number | null {
  const teaching = assigned
    .filter(r => r.isTeaching)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (teaching.length === 0) return null;
  const primary = teaching.find(r => r.dutyUnits != null);
  const base = primary?.dutyUnits ?? 0;
  const reduction = assigned.reduce((s, r) => s + (Number.isFinite(r.reductionUnits) ? r.reductionUnits : 0), 0);
  return Math.max(0, base - reduction);
}

/**
 * بارگذاری دسته‌جمعی موظفی مؤثر همهٔ اساتید یک ترم (بدون N+1 — یک کوئری).
 * خروجی: staffId → موظفی مؤثر؛ غایب در نقشه = بدون نقش تدریسی (fallback قدیمی).
 */
export async function loadTermEffectiveDuties(termId: number): Promise<Map<number, number>> {
  const { sql } = await import('drizzle-orm');
  const out = new Map<number, number>();
  const res = await db.execute(sql`
    WITH ranked AS (
      SELECT str."staffId" AS "staffId",
             r."dutyUnits" AS "dutyUnits",
             r."reductionUnits" AS "reductionUnits",
             r."isTeaching" AS "isTeaching",
             r."sortOrder" AS "sortOrder",
             ROW_NUMBER() OVER (
               PARTITION BY str."staffId"
               ORDER BY r."sortOrder" ASC, r."id" ASC
             ) AS rn_teaching
      FROM "staff_term_roles" str
      JOIN "payroll_duty_roles" r ON r."id" = str."roleId"
      WHERE str."termId" = ${termId} AND r."isTeaching" = 1
    ),
    base AS (
      SELECT "staffId", COALESCE(MAX(CASE WHEN rn_teaching = 1 THEN "dutyUnits" END), 0) AS "base"
      FROM ranked GROUP BY "staffId"
    ),
    red AS (
      SELECT str."staffId" AS "staffId", COALESCE(SUM(r."reductionUnits"), 0) AS "red"
      FROM "staff_term_roles" str
      JOIN "payroll_duty_roles" r ON r."id" = str."roleId"
      WHERE str."termId" = ${termId}
      GROUP BY str."staffId"
    )
    SELECT b."staffId" AS "staffId",
           GREATEST(0, b."base" - COALESCE(r."red", 0)) AS "duty"
    FROM base b LEFT JOIN red r ON r."staffId" = b."staffId"
  `);
  for (const row of (res.rows ?? []) as { staffId: number; duty: string | number }[]) {
    out.set(Number(row.staffId), Number(row.duty));
  }
  return out;
}

/** اسنپ‌شات مرتبه/پایه/نرخ یک استاد در لحظهٔ ساخت قرارداد (از staff + نرخ جاری) */
export async function snapshotStaffRankBase(
  staffId: number, liveRate: number,
): Promise<{ rank: string | null; base: string | null; rate: number }> {
  const [s] = await db
    .select({ academicRank: staff.academicRank, academicBase: staff.academicBase })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);
  return {
    rank: s?.academicRank ?? null,
    base: s?.academicBase ?? null,
    rate: liveRate,
  };
}

/** اسنپ‌شت قرارداد یک استاد در ترم (برای مهر هنگام compute) */
export async function loadContractSnapshots(termId: number): Promise<Map<number, {
  contractId: number;
  rank: string | null; base: string | null; rate: number | null;
}>> {
  const out = new Map<number, { contractId: number; rank: string | null; base: string | null; rate: number | null }>();
  const rows = await db.select({
    contractId: professor_term_contracts.id,
    staffId: professor_term_contracts.staffId,
    rankSnapshot: professor_term_contracts.rankSnapshot,
    baseSnapshot: professor_term_contracts.baseSnapshot,
    rateSnapshot: professor_term_contracts.rateSnapshot,
  }).from(professor_term_contracts).where(eq(professor_term_contracts.termId, termId));
  for (const r of rows) {
    out.set(r.staffId, {
      contractId: r.contractId,
      rank: r.rankSnapshot ?? null,
      base: r.baseSnapshot ?? null,
      rate: r.rateSnapshot == null ? null : Number(r.rateSnapshot),
    });
  }
  return out;
}

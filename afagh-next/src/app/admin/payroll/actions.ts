'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import {
  computeTermPayroll, exportBatch, getOverview, getStaffPayslip,
  listPayConfiguration, payMidterm, settleFinal,
} from '@/lib/payroll-engine';

function fail(err: unknown) {
  return { ok: false as const, error: (err as Error)?.message || 'خطای ناشناخته' };
}

export async function payrollOverviewAction() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const ov = await getOverview();
    return { ok: true as const, term: ov.term, list: ov.list, totals: ov.totals };
  } catch (err) {
    return fail(err);
  }
}

export async function payrollComputeAction() {
  try {
    const user = await requireRole(['ADMIN', 'EDU_EXPERT']);
    const res = await computeTermPayroll(user.id);
    revalidatePath('/admin/payroll');
    return { ...res, ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function payrollPayslipAction(staffId: number) {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const slip = await getStaffPayslip(staffId);
    return { ok: true as const, ...slip };
  } catch (err) {
    return fail(err);
  }
}

export async function payrollMidtermAction(staffId: number) {
  try {
    const user = await requireRole(['ADMIN']);
    const res = await payMidterm(staffId, user.id);
    revalidatePath('/admin/payroll');
    return { ...res, ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function payrollSettleAction(staffId: number) {
  try {
    const user = await requireRole(['ADMIN']);
    const res = await settleFinal(staffId, user.id);
    revalidatePath('/admin/payroll');
    return { ...res, ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function payrollExportAction() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const res = await exportBatch();
    return { ...res, ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function payrollConfigAction() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const cfg = await listPayConfiguration();
    return {
      ok: true as const,
      year: cfg.year,
      coefs: cfg.coefs,
      crowded: cfg.crowded,
      sessions: cfg.sessions,
      midterm: cfg.midterm,
      rates: cfg.rates.map(r => ({
        academicRank: r.academicRank, degree: r.degree,
        baseRatePerUnit: Number(r.baseRatePerUnit), effectiveYear: r.effectiveYear,
      })),
      rules: cfg.rules.map(r => ({
        id: r.id, offeringType: r.offeringType, professorRole: r.professorRole,
        academicRank: r.academicRank, multiplierUnit: r.multiplierUnit,
        multiplierPerStudent: r.multiplierPerStudent, flatFee: r.flatFee, title: r.title,
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// مدیریت ضرایب تدریس (teaching_coefficients)
// ─────────────────────────────────────────────────────────────────

export async function getTeachingCoefficientsAction() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const { db } = await import('@/db');
    const { teaching_coefficients } = await import('@/db/schema');
    const { or, eq, isNull } = await import('drizzle-orm');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    const rows = await db.select().from(teaching_coefficients)
      .where(uni ? or(eq(teaching_coefficients.universityId, uni.id), isNull(teaching_coefficients.universityId)) : undefined);
    return { ok: true as const, coefficients: rows };
  } catch (err) {
    return fail(err);
  }
}

export async function updateTeachingCoefficientAction(ruleName: string, multiplier: number) {
  try {
    const user = await requireRole(['ADMIN']);
    const { db } = await import('@/db');
    const { teaching_coefficients } = await import('@/db/schema');
    const { and, eq, isNull, or } = await import('drizzle-orm');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return fail(new Error('دانشگاه فعال نامشخص است.'));
    const uniScope = or(eq(teaching_coefficients.universityId, uni.id), isNull(teaching_coefficients.universityId));
    const [cur] = await db.select({ universityId: teaching_coefficients.universityId })
      .from(teaching_coefficients).where(and(eq(teaching_coefficients.ruleName, ruleName), uniScope)).limit(1);
    if (!cur) return fail(new Error('ضریب یافت نشد یا متعلق به دانشگاه دیگری است.'));

    await db
      .update(teaching_coefficients)
      .set({ multiplier: String(multiplier) })
      .where(and(eq(teaching_coefficients.ruleName, ruleName), uniScope));

    revalidatePath('/admin/payroll');
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertTeachingCoefficientAction(ruleName: string, multiplier: number) {
  try {
    const user = await requireRole(['ADMIN']);
    const { db } = await import('@/db');
    const { teaching_coefficients } = await import('@/db/schema');
    const { and, eq, isNull, or } = await import('drizzle-orm');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return fail(new Error('دانشگاه فعال نامشخص است.'));
    const uniScope = or(eq(teaching_coefficients.universityId, uni.id), isNull(teaching_coefficients.universityId));

    const existing = await db
      .select()
      .from(teaching_coefficients)
      .where(and(eq(teaching_coefficients.ruleName, ruleName), uniScope))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(teaching_coefficients)
        .set({ multiplier: String(multiplier) })
        .where(and(eq(teaching_coefficients.ruleName, ruleName), uniScope));
    } else {
      await db.insert(teaching_coefficients).values({ universityId: uni.id, ruleName, multiplier: String(multiplier) });
    }
    
    revalidatePath('/admin/payroll');
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// مدیریت قوانین محاسبه حق‌التدریس (payroll_calculation_rules)
// ─────────────────────────────────────────────────────────────────

export async function getPayrollCalculationRulesAction() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const { db } = await import('@/db');
    const { payroll_calculation_rules } = await import('@/db/schema');
    const { and, eq, isNull, or } = await import('drizzle-orm');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    const rows = await db
      .select()
      .from(payroll_calculation_rules)
      .where(and(
        eq(payroll_calculation_rules.isActive, 1),
        uni ? or(eq(payroll_calculation_rules.universityId, uni.id), isNull(payroll_calculation_rules.universityId)) : undefined,
      ));
    return { ok: true as const, rules: rows };
  } catch (err) {
    return fail(err);
  }
}

export async function createPayrollCalculationRuleAction(data: {
  offeringType: string | null;
  professorRole: string | null;
  academicRank: string | null;
  multiplierUnit: number | null;
  multiplierPerStudent: number | null;
  flatFee: number | null;
  title: string;
}) {
  try {
    const user = await requireRole(['ADMIN']);
    const { db } = await import('@/db');
    const { payroll_calculation_rules } = await import('@/db/schema');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return fail(new Error('دانشگاه فعال نامشخص است.'));

    await db.insert(payroll_calculation_rules).values({
      universityId: uni.id,
      offeringType: data.offeringType,
      professorRole: data.professorRole,
      academicRank: data.academicRank,
      multiplierUnit: data.multiplierUnit?.toString() ?? null,
      multiplierPerStudent: data.multiplierPerStudent?.toString() ?? null,
      flatFee: data.flatFee?.toString() ?? null,
      title: data.title,
      isActive: 1,
    });
    
    revalidatePath('/admin/payroll');
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePayrollCalculationRuleAction(id: number, data: {
  offeringType: string | null;
  professorRole: string | null;
  academicRank: string | null;
  multiplierUnit: number | null;
  multiplierPerStudent: number | null;
  flatFee: number | null;
  title: string;
  isActive: number;
}) {
  try {
    const user = await requireRole(['ADMIN']);
    const { db } = await import('@/db');
    const { payroll_calculation_rules } = await import('@/db/schema');
    const { and, eq, isNull, or } = await import('drizzle-orm');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return fail(new Error('دانشگاه فعال نامشخص است.'));
    const [cur] = await db.select({ universityId: payroll_calculation_rules.universityId })
      .from(payroll_calculation_rules).where(eq(payroll_calculation_rules.id, id)).limit(1);
    if (!cur) return fail(new Error('قانون یافت نشد.'));
    if (cur.universityId !== null && cur.universityId !== uni.id) {
      return fail(new Error('قانون متعلق به دانشگاه دیگری است.'));
    }

    await db
      .update(payroll_calculation_rules)
      .set({
        offeringType: data.offeringType,
        professorRole: data.professorRole,
        academicRank: data.academicRank,
        multiplierUnit: data.multiplierUnit?.toString() ?? null,
        multiplierPerStudent: data.multiplierPerStudent?.toString() ?? null,
        flatFee: data.flatFee?.toString() ?? null,
        title: data.title,
        isActive: data.isActive,
        updatedAt: new Date(),
      })
      .where(and(
        eq(payroll_calculation_rules.id, id),
        or(eq(payroll_calculation_rules.universityId, uni.id), isNull(payroll_calculation_rules.universityId)),
      ));
    
    revalidatePath('/admin/payroll');
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePayrollCalculationRuleAction(id: number) {
  try {
    const user = await requireRole(['ADMIN']);
    const { db } = await import('@/db');
    const { payroll_calculation_rules } = await import('@/db/schema');
    const { and, eq, isNull, or } = await import('drizzle-orm');
    const { getCurrentUniversity } = await import('@/lib/university-scope');
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return fail(new Error('دانشگاه فعال نامشخص است.'));
    const [cur] = await db.select({ universityId: payroll_calculation_rules.universityId })
      .from(payroll_calculation_rules).where(eq(payroll_calculation_rules.id, id)).limit(1);
    if (!cur) return fail(new Error('قانون یافت نشد.'));
    if (cur.universityId !== null && cur.universityId !== uni.id) {
      return fail(new Error('قانون متعلق به دانشگاه دیگری است.'));
    }

    await db
      .delete(payroll_calculation_rules)
      .where(and(
        eq(payroll_calculation_rules.id, id),
        or(eq(payroll_calculation_rules.universityId, uni.id), isNull(payroll_calculation_rules.universityId)),
      ));
    
    revalidatePath('/admin/payroll');
    return { ok: true as const };
  } catch (err) {
    return fail(err);
  }
}

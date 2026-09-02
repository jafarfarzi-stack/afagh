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

'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tuition_fee_rules } from '@/db/schema';
import { requireRole } from '@/lib/auth';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

export type FeeRuleInput = {
  id?: number;
  degreeLevelId?: number | null;
  termType?: string | null;
  offeringType?: string | null;
  fixedTuition: number;
  perUnitTuition: number;
  effectiveFromYear?: number | null;
  isActive?: boolean;
  note?: string | null;
};

const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' || s === 'null' || s === 'undefined' ? null : s;
};
const numOr = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : d;
};

/** ایجاد یا به‌روزرسانی یک قاعدهٔ شهریه */
export async function saveFeeRuleAction(input: FeeRuleInput): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);

  const fixedTuition = numOr(input.fixedTuition);
  const perUnitTuition = numOr(input.perUnitTuition);
  if (fixedTuition === 0 && perUnitTuition === 0) {
    return { ok: false, error: 'دست‌کم یکی از مقادیر «شهریهٔ ثابت» یا «شهریهٔ هر واحد» باید بزرگ‌تر از صفر باشد.' };
  }

  const row = {
    degreeLevelId: input.degreeLevelId ? Number(input.degreeLevelId) : null,
    termType: clean(input.termType),
    offeringType: clean(input.offeringType),
    fixedTuition: String(fixedTuition),
    perUnitTuition: String(perUnitTuition),
    effectiveFromYear: input.effectiveFromYear ? Number(input.effectiveFromYear) : null,
    isActive: input.isActive === false ? 0 : 1,
    note: clean(input.note),
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(tuition_fee_rules).set(row).where(eq(tuition_fee_rules.id, Number(input.id)));
  } else {
    await db.insert(tuition_fee_rules).values(row);
  }

  revalidatePath('/admin/tuition');
  return { ok: true };
}

/** حذف یک قاعدهٔ شهریه */
export async function deleteFeeRuleAction(id: number): Promise<{ ok: boolean; error?: string }> {
  await requireRole(FINANCE);
  await db.delete(tuition_fee_rules).where(eq(tuition_fee_rules.id, Number(id)));
  revalidatePath('/admin/tuition');
  return { ok: true };
}

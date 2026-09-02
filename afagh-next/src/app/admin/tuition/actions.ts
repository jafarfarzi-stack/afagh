'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { academic_terms, term_financial_rules, tuition_fee_rules } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { jalaliYearFromTermCode, mapLegacyFeeRules, termTypeOf } from '@/lib/tuition-rules';

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

/**
 * درون‌ریزی قواعد مالی قدیمی (`term_financial_rules`) در موتور جدید (`tuition_fee_rules`).
 *
 * چرا لازم است: ماژول مهاجرت داده‌ها جدول قدیمی را پر می‌کند، ولی موتور شهریه از
 * جدول جدید می‌خواند. بدون این پل، پس از مهاجرت هیچ قاعده‌ای وجود ندارد و شهریه
 * بی‌صدا «صفر» محاسبه می‌شود.
 *
 * رفتار:
 *  - قواعد به ازای (مقطع، نوع ترم، سال مؤثر) جمع می‌شوند و جدیدترین ترم برنده است؛
 *  - قواعد تکراری (همان مقطع+نوع ترم+سال) دوباره ساخته نمی‌شوند → اجرایش بی‌خطر و تکرارپذیر است؛
 *  - `offeringType` خالی می‌ماند، چون جدول قدیمی این تفکیک را ندارد؛ نرخ خاص
 *    معادل‌سازی (TRANSFER) را مدیر باید خودش در همین صفحه تعریف کند.
 */
export async function importLegacyFeeRulesAction(): Promise<{
  ok: boolean;
  error?: string;
  created?: number;
  skipped?: number;
}> {
  await requireRole(FINANCE);

  const legacy = await db
    .select({
      id: term_financial_rules.id,
      degreeLevelId: term_financial_rules.degreeLevelId,
      fixedTuition: term_financial_rules.fixedTuition,
      perUnitTuition: term_financial_rules.perUnitTuition,
      termId: academic_terms.id,
      termCode: academic_terms.termCode,
      termType: academic_terms.termType,
      isSummer: academic_terms.isSummer,
    })
    .from(term_financial_rules)
    .innerJoin(academic_terms, eq(academic_terms.id, term_financial_rules.termId));

  const drafts = mapLegacyFeeRules(
    legacy.map((r) => ({
      degreeLevelId: r.degreeLevelId,
      termType: termTypeOf({ termType: r.termType, termCode: r.termCode, isSummer: r.isSummer }),
      fixedTuition: r.fixedTuition,
      perUnitTuition: r.perUnitTuition,
      effectiveFromYear: jalaliYearFromTermCode(r.termCode),
      termSortKey: r.termId ?? 0,
    })),
  );

  let created = 0;
  let skipped = 0;
  for (const d of drafts) {
    // بررسی تکراری: NULL باید با isNull سنجیده شود. (eq(col, -1) هرگز مطابقت
    // نمی‌کند و باعث درج قاعدهٔ تکراری در هر اجرا می‌شد.)
    const exists = await db
      .select({ id: tuition_fee_rules.id })
      .from(tuition_fee_rules)
      .where(
        and(
          d.degreeLevelId == null
            ? isNull(tuition_fee_rules.degreeLevelId)
            : eq(tuition_fee_rules.degreeLevelId, d.degreeLevelId),
          eq(tuition_fee_rules.termType, d.termType),
          isNull(tuition_fee_rules.offeringType),
          d.effectiveFromYear == null
            ? isNull(tuition_fee_rules.effectiveFromYear)
            : eq(tuition_fee_rules.effectiveFromYear, d.effectiveFromYear),
        ),
      )
      .limit(1);
    if (exists.length) { skipped++; continue; }

    await db.insert(tuition_fee_rules).values({
      degreeLevelId: d.degreeLevelId,
      termType: d.termType,
      offeringType: null,
      fixedTuition: String(d.fixedTuition),
      perUnitTuition: String(d.perUnitTuition),
      effectiveFromYear: d.effectiveFromYear,
      isActive: 1,
      note: d.note,
      updatedAt: new Date(),
    });
    created++;
  }

  revalidatePath('/admin/tuition');
  return { ok: true, created, skipped };
}

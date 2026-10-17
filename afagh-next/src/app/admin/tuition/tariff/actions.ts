'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tuition_term_tariff } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { shiftPriceCodeYear } from '@/lib/tuition-tariff-core';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];
const PATH = '/admin/tuition/tariff';

export interface TariffRateInput {
  maliType: number;
  th: number;
  op: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const yearOk = (y: number) => Number.isInteger(y) && y >= 1380 && y <= 1450;

/**
 * ذخیرهٔ نرخ‌های یک «گروه تعرفه» (کد قیمت) در یک سال — برای همهٔ رشته‌ها و
 * ورودی‌های آن گروه، چون نرخ از خودِ گروه می‌آید نه از رشته.
 */
export async function saveTariffGroupAction(input: {
  year: number;
  uPriceCode: string;
  rates: TariffRateInput[];
}): Promise<{ ok: boolean; error?: string; updated?: number }> {
  await requireRole(FINANCE);
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { ok: false, error: 'دانشگاه فعال مشخص نیست.' };

  const year = Number(input.year);
  const code = String(input.uPriceCode ?? '').trim();
  if (!yearOk(year) || !code) return { ok: false, error: 'سال یا گروه تعرفه نامعتبر است.' };

  const rates = (input.rates || []).filter((r) => Number.isFinite(Number(r?.maliType)));
  if (!rates.length) return { ok: false, error: 'نرخی برای ذخیره نیامده است.' };

  let updated = 0;
  for (const r of rates) {
    const changed = await db
      .update(tuition_term_tariff)
      .set({
        thPrice: String(num(r.th)),
        opPrice: String(num(r.op)),
        source: 'MANUAL',
        updatedAt: new Date(),
      })
      .where(and(
        eq(tuition_term_tariff.universityId, uni.id),
        eq(tuition_term_tariff.termYear, year),
        eq(tuition_term_tariff.uPriceCode, code),
        eq(tuition_term_tariff.maliType, Number(r.maliType)),
      ))
      .returning({ id: tuition_term_tariff.id });
    updated += changed.length;
  }
  revalidatePath(PATH);
  return { ok: true, updated };
}

/**
 * تعریف تعرفهٔ سال نو با «کپی از سال قبل»: همهٔ ردیف‌های سال مبدأ با همان
 * نرخ‌ها به سال مقصد منتقل می‌شوند و کد گروه با رقم سالِ تازه بازنویسی می‌شود.
 * منبع ردیف‌های تازه MANUAL است تا از تعرفهٔ واردشدهٔ سما جدا باشد.
 */
export async function copyTariffYearAction(input: {
  fromYear: number;
  toYear: number;
  overwrite?: boolean;
}): Promise<{ ok: boolean; error?: string; inserted?: number }> {
  await requireRole(FINANCE);
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { ok: false, error: 'دانشگاه فعال مشخص نیست.' };

  const fromYear = Number(input.fromYear);
  const toYear = Number(input.toYear);
  if (!yearOk(fromYear) || !yearOk(toYear) || toYear <= fromYear) {
    return { ok: false, error: 'سال‌ها نامعتبرند (سال مقصد باید بعد از مبدأ باشد).' };
  }

  const rows = await db
    .select()
    .from(tuition_term_tariff)
    .where(and(eq(tuition_term_tariff.universityId, uni.id), eq(tuition_term_tariff.termYear, fromYear)));
  if (!rows.length) return { ok: false, error: `تعرفه‌ای برای سال ${fromYear} ثبت نشده است.` };

  const existing = await db
    .select({ id: tuition_term_tariff.id })
    .from(tuition_term_tariff)
    .where(and(eq(tuition_term_tariff.universityId, uni.id), eq(tuition_term_tariff.termYear, toYear)))
    .limit(1);
  if (existing.length && !input.overwrite) {
    return { ok: false, error: `تعرفهٔ سال ${toYear} از قبل وجود دارد. برای بازنویسی، «بازنویسی» را بزنید.` };
  }
  if (existing.length) {
    await db.delete(tuition_term_tariff).where(and(
      eq(tuition_term_tariff.universityId, uni.id),
      eq(tuition_term_tariff.termYear, toYear),
    ));
  }

  const termCode = `${toYear}1`;
  const payload = rows.map((r) => ({
    universityId: uni.id,
    termCode,
    termYear: toYear,
    majorId: r.majorId,
    entryYear: r.entryYear,
    maliType: r.maliType,
    thPrice: r.thPrice,
    opPrice: r.opPrice,
    uPriceCode: shiftPriceCodeYear(r.uPriceCode, fromYear, toYear),
    source: 'MANUAL',
    updatedAt: new Date(),
  }));
  for (let i = 0; i < payload.length; i += 500) {
    await db.insert(tuition_term_tariff).values(payload.slice(i, i + 500));
  }
  revalidatePath(PATH);
  return { ok: true, inserted: payload.length };
}

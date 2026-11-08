import 'server-only';
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  academic_terms, students, tuition_price_code_templates, tuition_term_tariff,
} from '@/db/schema';
import { shiftPriceCodeYear } from '@/lib/tuition-tariff-core';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  کدهای شهریهٔ سربرگ نیمسال — کارنامهٔ مالی «نوع الف»
 *
 *  سند قدیمی سما بالای هر نیمسال چهار کد چاپ میکند:
 *
 *      کد ثابت  …  ·  اولیه  …  ·  کد متغیر  …  ·  اولیه  …
 *
 *  ▸ «کد ثابت» (FPrice_code) در **همهٔ ترمها** ثابت است و از «قالبِ
 *    نیمسال ورود» دانشجو میآید (tuition_price_code_templates).
 *  ▸ «اولیهٔ ثابت» همان کد ثابت است، مگر اینکه صریحاً چیز دیگری ثبت شود.
 *  ▸ «کد متغیر» (UPrice_code) **سالبهسال** عوض میشود و از
 *    tuition_term_tariff."uPriceCode" همان سال خوانده میشود.
 *  ▸ «اولیهٔ متغیر» کد متغیرِ سالِ ورود است و در تمام ترمها ثابت میماند.
 *
 *  هیچ عددی در لایهٔ نمایش سختکد نشده: همگی از دیتابیس میآیند و جایی که
 *  داده ثبت نشده باشد «—» چاپ میشود، نه یک کدِ اشتباه.
 * ══════════════════════════════════════════════════════════════════════
 */

export interface TuitionPriceCodeTemplate {
  /** کد ثابت (FPrice_code) — ثابت در تمام ترمها */
  fixedPriceCode: string | null;
  /** اولیهٔ کد ثابت */
  initialFixedPriceCode: string | null;
  /** اولیهٔ کد متغیر = کد متغیرِ نیمسال ورود */
  initialVariablePriceCode: string | null;
}

export interface TermTuitionPriceCodes extends TuitionPriceCodeTemplate {
  /** کد متغیر مربوط به **همان** نیمسال (سالبهسال تغییر میکند) */
  variablePriceCode: string | null;
}

export interface ResolvedTuitionPriceCodes {
  template: TuitionPriceCodeTemplate;
  byTerm: Record<number, TermTuitionPriceCodes>;
}

const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

/** سال از کد ۵رقمی نیمسال («13901» → ۱۳۹۰)؛ نامعتبر → null */
const yearOf = (termCode: string | null | undefined): number | null => {
  const y = Number(String(termCode ?? '').trim().slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
};

/**
 * قالبِ کدها را با «خاصترین ردیف برنده» پیدا میکند: ابتدا ردیف دقیق
 * (دانشگاه + رشته + مقطع + سال ورود + نیمسال ورود)، بعد ردیفهای wildcard
 * (NULL / ۰) تا در نبود دادهٔ رشتهای هم یک قالب سراسری کار کند.
 */
async function findTemplate(stu: {
  universityId: number | null;
  majorId: number | null;
  degreeLevelId: number | null;
  entryYear: number | null;
  entryTerm: number | null;
}): Promise<TuitionPriceCodeTemplate> {
  const t = tuition_price_code_templates;
  const scope: SQL[] = [eq(t.isActive, 1)];

  const push = (cond: SQL | undefined) => { if (cond) scope.push(cond); };
  const wildcard = (col: AnyPgColumn, value: number | null) =>
    value == null ? isNull(col) : or(eq(col, value), isNull(col));

  push(wildcard(t.universityId, stu.universityId));
  push(wildcard(t.majorId, stu.majorId));
  push(wildcard(t.degreeLevelId, stu.degreeLevelId));
  push(inArray(t.entryYear, stu.entryYear ? [0, stu.entryYear] : [0]));
  push(inArray(t.entryTerm, stu.entryTerm ? [0, stu.entryTerm] : [0]));

  const rows = await db.select().from(t).where(and(...scope));
  const score = (r: typeof rows[number]) =>
    (r.universityId != null ? 8 : 0) +
    (r.majorId != null ? 4 : 0) +
    (r.degreeLevelId != null ? 2 : 0) +
    (r.entryYear !== 0 ? 2 : 0) +
    (r.entryTerm !== 0 ? 1 : 0);
  rows.sort((a, b) => score(b) - score(a));
  const best = rows[0];
  return {
    fixedPriceCode: clean(best?.fixedPriceCode),
    initialFixedPriceCode: clean(best?.initialFixedPriceCode),
    initialVariablePriceCode: clean(best?.initialVariablePriceCode),
  };
}

/**
 * کدهای شهریه را برای چند نیمسال یک دانشجو حل میکند. یکبار صدا زده میشود
 * (از buildTranscriptCourses) تا کارنامهٔ ادمین، صفحهٔ دانشجو و گزارش
 * صورتحساب دقیقاً یک خروجی بگیرند.
 */
export async function resolveTuitionPriceCodes(
  studentId: number,
  termIds: number[],
): Promise<ResolvedTuitionPriceCodes> {
  const ids = [...new Set((termIds || []).filter((n) => Number.isFinite(n) && n > 0))];
  const empty: ResolvedTuitionPriceCodes = {
    template: { fixedPriceCode: null, initialFixedPriceCode: null, initialVariablePriceCode: null },
    byTerm: {},
  };
  if (!ids.length) return empty;

  const [stu] = await db.select({
    universityId: students.universityId,
    majorId: students.majorId,
    degreeLevelId: students.degreeLevelId,
    entryYear: students.entryYear,
    entryTerm: students.entryTerm,
  }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!stu) return empty;

  const [termRows, template] = await Promise.all([
    db.select({ id: academic_terms.id, termCode: academic_terms.termCode })
      .from(academic_terms).where(inArray(academic_terms.id, ids)),
    findTemplate(stu),
  ]);

  // ── کد متغیر و کد ثابت از تعرفهٔ رسمی (همان منبعی که نرخها از آن میآیند) ──
  const tariffRows = stu.universityId && stu.majorId && stu.entryYear
    ? await db.select({
        termYear: tuition_term_tariff.termYear,
        termCode: tuition_term_tariff.termCode,
        uPriceCode: tuition_term_tariff.uPriceCode,
        fPriceCode: tuition_term_tariff.fPriceCode,
      }).from(tuition_term_tariff).where(and(
        eq(tuition_term_tariff.universityId, stu.universityId),
        eq(tuition_term_tariff.majorId, stu.majorId),
        eq(tuition_term_tariff.entryYear, stu.entryYear),
      ))
    : [];

  const variableVotes = new Map<number, Map<string, number>>();
  const fixedVotes = new Map<number, Map<string, number>>();
  for (const r of tariffRows) {
    const year = Number(r.termYear ?? yearOf(r.termCode));
    if (!Number.isFinite(year) || year <= 0) continue;
    for (const [code, votes] of [
      [clean(r.uPriceCode), variableVotes],
      [clean(r.fPriceCode), fixedVotes],
    ] as const) {
      if (!code) continue;
      const m = votes.get(year) || new Map<string, number>();
      m.set(code, (m.get(code) ?? 0) + 1);
      votes.set(year, m);
    }
  }
  const bestCode = (votes: Map<number, Map<string, number>>, year: number | null): string | null => {
    if (year == null) return null;
    const m = votes.get(year);
    if (!m) return null;
    let best = ''; let n = 0;
    for (const [code, count] of m) if (count > n) { best = code; n = count; }
    return best || null;
  };

  const entryYear = stu.entryYear ?? null;
  // پشتیبان کد ثابت: اگر FPrice_code بعدها مستقیماً در تعرفه وارد شد.
  const tariffFixed = bestCode(fixedVotes, entryYear)
    ?? (() => {
      for (const [year] of fixedVotes) return bestCode(fixedVotes, year);
      return null;
    })();
  const fixedPriceCode = template.fixedPriceCode ?? tariffFixed;
  const initialFixedPriceCode = template.initialFixedPriceCode ?? fixedPriceCode;
  // «اولیهٔ متغیر»: قالب، وگرنه کد متغیرِ سال ورود از تعرفهٔ رسمی.
  const initialVariablePriceCode = template.initialVariablePriceCode
    ?? bestCode(variableVotes, entryYear);

  const finalTemplate: TuitionPriceCodeTemplate = {
    fixedPriceCode,
    initialFixedPriceCode,
    initialVariablePriceCode,
  };

  const byTerm: Record<number, TermTuitionPriceCodes> = {};
  for (const t of termRows) {
    const year = yearOf(t.termCode);
    // کد متغیرِ همان سال؛ اگر تعرفهٔ آن سال ثبت نشده، کدِ سال ورود با رقم
    // سال جابجا میشود (همان قرارداد shiftPriceCodeYear در سامانهٔ سما).
    const variablePriceCode = bestCode(variableVotes, year)
      ?? (year != null && entryYear != null
        ? shiftPriceCodeYear(initialVariablePriceCode, entryYear, year)
        : null);
    byTerm[t.id] = { ...finalTemplate, variablePriceCode };
  }
  // نیمسالهایی که در academic_terms پیدا نشدند هم سهمشان را بگیرند تا
  // سربرگشان خالی نماند.
  for (const id of ids) {
    if (!byTerm[id]) byTerm[id] = { ...finalTemplate, variablePriceCode: null };
  }
  return { template: finalTemplate, byTerm };
}

import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academic_terms, degree_level_configs, legacy_financial_records, legacy_tuition_formulas,
  term_financial_rules, tuition_compare_items, tuition_compare_runs,
} from '@/db/schema';
import { norm, num } from './normalize';
import { iterate, missingHeaders, pickTable, type Table } from './tabular';
import { resolverFor } from './codemap';

// ═══ انتقال فرمول‌های شهریه + مقایسه با دادهٔ مالی قدیمی ═══
// دو نیمه دارد:
//   ۱) فرمول‌ها: از اکسل واحد مالی وارد می‌شوند، با یک ارزیاب امن محاسبه می‌شوند
//      و می‌توانند روی «قواعد مالی ترم» سامانهٔ جدید اعمال شوند.
//   ۲) مقایسه: مبلغی که فرمول محاسبه می‌کند در برابر مبلغی که واقعاً در سیستم
//      قدیمی برای همان دانشجو/ترم ثبت شده — تا قبل از سوئیچ، اختلاف‌ها دیده شود.

// ───────────────── ارزیاب امن فرمول (بدون eval) ─────────────────
type Ctx = Record<string, number>;

class Parser {
  private i = 0;
  constructor(private readonly src: string, private readonly ctx: Ctx) {}

  static evaluate(expr: string, ctx: Ctx): number {
    const p = new Parser(expr, ctx);
    const v = p.parseExpr();
    p.skip();
    if (p.i < p.src.length) throw new Error(`نویسهٔ نامعتبر در فرمول: «${p.src.slice(p.i, p.i + 8)}»`);
    if (!Number.isFinite(v)) throw new Error('حاصل فرمول عددی معتبر نیست.');
    return v;
  }

  private skip() { while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++; }
  private eat(tok: string): boolean {
    this.skip();
    if (this.src.startsWith(tok, this.i)) { this.i += tok.length; return true; }
    return false;
  }

  /** لایهٔ ۱: مقایسه‌ها (برای if) */
  parseExpr(): number {
    let left = this.parseAdd();
    for (;;) {
      this.skip();
      const op = ['>=', '<=', '==', '!=', '>', '<'].find(o => this.src.startsWith(o, this.i));
      if (!op) return left;
      this.i += op.length;
      const right = this.parseAdd();
      const r = op === '>=' ? left >= right : op === '<=' ? left <= right : op === '==' ? left === right
        : op === '!=' ? left !== right : op === '>' ? left > right : left < right;
      left = r ? 1 : 0;
    }
  }

  private parseAdd(): number {
    let v = this.parseMul();
    for (;;) {
      if (this.eat('+')) v += this.parseMul();
      else if (this.eat('-')) v -= this.parseMul();
      else return v;
    }
  }

  private parseMul(): number {
    let v = this.parsePow();
    for (;;) {
      if (this.eat('*')) v *= this.parsePow();
      else if (this.eat('/')) { const d = this.parsePow(); if (d === 0) throw new Error('تقسیم بر صفر در فرمول.'); v /= d; }
      else if (this.eat('%')) { const d = this.parsePow(); if (d === 0) throw new Error('باقی‌مانده بر صفر در فرمول.'); v %= d; }
      else return v;
    }
  }

  private parsePow(): number {
    const base = this.parseUnary();
    if (this.eat('^')) return Math.pow(base, this.parsePow());
    return base;
  }

  private parseUnary(): number {
    if (this.eat('-')) return -this.parseUnary();
    if (this.eat('+')) return this.parseUnary();
    return this.parseAtom();
  }

  private parseAtom(): number {
    this.skip();
    if (this.eat('(')) {
      const v = this.parseExpr();
      if (!this.eat(')')) throw new Error('پرانتز بسته‌نشده در فرمول.');
      return v;
    }
    const numMatch = /^\d+(\.\d+)?/.exec(this.src.slice(this.i));
    if (numMatch) { this.i += numMatch[0].length; return Number(numMatch[0]); }

    const idMatch = /^[A-Za-z_\u0600-\u06FF][A-Za-z0-9_\u0600-\u06FF]*/.exec(this.src.slice(this.i));
    if (!idMatch) throw new Error(`عبارت نامعتبر در فرمول نزدیک «${this.src.slice(this.i, this.i + 8)}»`);
    const name = idMatch[0];
    this.i += name.length;

    if (this.eat('(')) {
      const args: number[] = [];
      if (!this.eat(')')) {
        do { args.push(this.parseExpr()); } while (this.eat(','));
        if (!this.eat(')')) throw new Error(`پرانتز تابع ${name} بسته نشده.`);
      }
      return callFn(name, args);
    }
    const key = name.toLowerCase();
    const found = Object.keys(this.ctx).find(k => k.toLowerCase() === key);
    if (found === undefined) throw new Error(`متغیر ناشناخته در فرمول: «${name}»`);
    return this.ctx[found];
  }
}

function callFn(name: string, a: number[]): number {
  switch (name.toLowerCase()) {
    case 'min': return Math.min(...a);
    case 'max': return Math.max(...a);
    case 'round': return a.length > 1 ? Math.round(a[0] / a[1]) * a[1] : Math.round(a[0]);
    case 'floor': return Math.floor(a[0]);
    case 'ceil': return Math.ceil(a[0]);
    case 'abs': return Math.abs(a[0]);
    case 'if': case 'اگر': return a[0] ? a[1] : (a[2] ?? 0);
    default: throw new Error(`تابع ناشناخته در فرمول: «${name}»`);
  }
}

/** ارزیابی امن یک عبارت ریاضی با متغیرهای داده‌شده */
export function evalFormula(expression: string, ctx: Ctx): number {
  return Parser.evaluate(norm(expression), ctx);
}

// ───────────────── محاسبهٔ شهریه ─────────────────
export type FormulaRow = typeof legacy_tuition_formulas.$inferSelect;

export type TuitionContext = {
  units: number; theoryUnits: number; practicalUnits: number; generalUnits: number;
  entryYear: number; discount: number;
};

export function buildContext(f: FormulaRow, c: TuitionContext): Ctx {
  let vars: Ctx = {};
  if (f.variables) {
    try {
      const parsed = JSON.parse(f.variables) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) { const n = num(v); if (n != null) vars[k] = n; }
    } catch { vars = {}; }
  }
  return {
    fixed: Number(f.fixedAmount ?? 0),
    ثابت: Number(f.fixedAmount ?? 0),
    perUnitTheory: Number(f.perUnitTheory ?? 0),
    perUnitPractical: Number(f.perUnitPractical ?? 0),
    perUnitGeneral: Number(f.perUnitGeneral ?? 0),
    units: c.units, theoryUnits: c.theoryUnits, practicalUnits: c.practicalUnits, generalUnits: c.generalUnits,
    واحد: c.units, واحد_نظری: c.theoryUnits, واحد_عملی: c.practicalUnits, واحد_عمومی: c.generalUnits,
    entryYear: c.entryYear, discount: c.discount, تخفیف: c.discount,
    ...vars,
  };
}

/** مبلغ شهریه طبق فرمول (عبارت متنی اولویت دارد؛ وگرنه ثابت + مجموع واحدها) */
export function computeTuition(f: FormulaRow, c: TuitionContext): { amount: number; detail: string } {
  const ctx = buildContext(f, c);
  if (f.expression && norm(f.expression)) {
    const amount = evalFormula(f.expression, ctx);
    return { amount: Math.round(amount), detail: `عبارت: ${norm(f.expression)}` };
  }
  const theory = c.theoryUnits || (c.units - c.practicalUnits - c.generalUnits);
  const amount =
    Number(f.fixedAmount ?? 0) +
    Math.max(theory, 0) * Number(f.perUnitTheory ?? 0) +
    c.practicalUnits * Number(f.perUnitPractical ?? 0) +
    c.generalUnits * Number(f.perUnitGeneral ?? 0) -
    c.discount;
  const detail = `ثابت ${Number(f.fixedAmount ?? 0).toLocaleString('fa-IR')} + نظری ${theory}×${Number(f.perUnitTheory ?? 0).toLocaleString('fa-IR')}`
    + ` + عملی ${c.practicalUnits}×${Number(f.perUnitPractical ?? 0).toLocaleString('fa-IR')}`
    + ` + عمومی ${c.generalUnits}×${Number(f.perUnitGeneral ?? 0).toLocaleString('fa-IR')}`
    + (c.discount ? ` − تخفیف ${c.discount.toLocaleString('fa-IR')}` : '');
  return { amount: Math.round(amount), detail };
}

/** انتخاب فرمول مناسب یک ردیف مالی: هرچه شرط‌های بیشتری منطبق باشد، اختصاصی‌تر است */
export function matchFormula(formulas: FormulaRow[], rec: {
  formulaCode?: string | null; termCode: string; degreeCode?: string | null; majorCode?: string | null; entryYear?: number | null;
}): FormulaRow | null {
  if (rec.formulaCode) {
    const direct = formulas.find(f => norm(f.formulaCode) === norm(rec.formulaCode ?? '')
      && (!f.termCode || norm(f.termCode) === norm(rec.termCode)));
    if (direct) return direct;
  }
  let best: { f: FormulaRow; score: number } | null = null;
  for (const f of formulas) {
    if (!f.isActive) continue;
    let score = 0;
    if (f.termCode) { if (norm(f.termCode) !== norm(rec.termCode)) continue; score += 4; }
    if (f.degreeCode) { if (norm(f.degreeCode) !== norm(rec.degreeCode ?? '')) continue; score += 2; }
    if (f.majorCode) { if (norm(f.majorCode) !== norm(rec.majorCode ?? '')) continue; score += 2; }
    if (f.entryYearFrom != null || f.entryYearTo != null) {
      const y = rec.entryYear ?? 0;
      if (f.entryYearFrom != null && y < f.entryYearFrom) continue;
      if (f.entryYearTo != null && y > f.entryYearTo) continue;
      score += 1;
    }
    if (!best || score > best.score) best = { f, score };
  }
  return best?.f ?? null;
}

// ───────────────── واردسازی از اکسل/CSV ─────────────────
export type ImportReport = {
  kind: string; fileName: string; sheet: string; total: number;
  inserted: number; updated: number; invalid: number;
  errors: { row: number; msg: string }[]; warnings: { row: number; msg: string }[];
  sample: Record<string, unknown>[];
};

const emptyReport = (kind: string, fileName: string, sheet: string): ImportReport =>
  ({ kind, fileName, sheet, total: 0, inserted: 0, updated: 0, invalid: 0, errors: [], warnings: [], sample: [] });

export const FORMULA_HEADERS = [
  { title: 'کد فرمول', aliases: ['کد فرمول', 'کدفرمول', 'formula_code', 'code'] },
];

/** واردسازی فرمول‌های شهریهٔ سیستم قدیمی */
export async function importFormulas(userId: number, sourceCode: string, tables: Table[], fileName: string): Promise<ImportReport> {
  const table = pickTable(tables, [['کد فرمول', 'formula_code', 'code'], ['شهریه ثابت', 'fixed'], ['هر واحد نظری', 'per_unit_theory']]);
  if (!table) return { ...emptyReport('tuition-formula', fileName, '-'), errors: [{ row: 0, msg: 'فایل خالی است.' }] };
  const rep = emptyReport('tuition-formula', fileName, table.sheet);

  const miss = missingHeaders(table, FORMULA_HEADERS);
  if (miss.length) { rep.errors.push({ row: 1, msg: `ستون‌های الزامی یافت نشد: ${miss.join('، ')}` }); return rep; }

  const rows = iterate(table);
  rep.total = rows.length;

  for (const r of rows) {
    const formulaCode = r.get(['کد فرمول', 'کدفرمول', 'formula_code', 'code']);
    if (!formulaCode) { rep.invalid++; rep.errors.push({ row: r.line, msg: 'کد فرمول خالی است.' }); continue; }

    const expression = r.get(['فرمول', 'عبارت', 'expression', 'formula']);
    if (expression) {
      try {
        evalFormula(expression, buildContext({
          fixedAmount: '0', perUnitTheory: '0', perUnitPractical: '0', perUnitGeneral: '0', variables: r.get(['متغیرها', 'variables']) || null,
        } as FormulaRow, { units: 12, theoryUnits: 8, practicalUnits: 2, generalUnits: 2, entryYear: 1400, discount: 0 }));
      } catch (e) {
        rep.invalid++;
        rep.errors.push({ row: r.line, msg: `فرمول «${formulaCode}» قابل ارزیابی نیست: ${(e as Error).message}` });
        continue;
      }
    }

    const values = {
      sourceCode,
      formulaCode,
      title: r.get(['عنوان', 'شرح', 'title']) || null,
      termCode: r.get(['کد ترم', 'ترم', 'term_code']) || null,
      degreeCode: r.get(['کد مقطع', 'مقطع', 'degree_code']) || null,
      majorCode: r.get(['کد رشته', 'رشته', 'major_code']) || null,
      entryYearFrom: num(r.get(['از ورودی', 'سال ورود از', 'entry_year_from'])) ?? null,
      entryYearTo: num(r.get(['تا ورودی', 'سال ورود تا', 'entry_year_to'])) ?? null,
      fixedAmount: String(Math.round(num(r.get(['شهریه ثابت', 'ثابت', 'fixed', 'fixed_amount'])) ?? 0)),
      perUnitTheory: String(Math.round(num(r.get(['هر واحد نظری', 'واحد نظری', 'per_unit_theory'])) ?? 0)),
      perUnitPractical: String(Math.round(num(r.get(['هر واحد عملی', 'واحد عملی', 'per_unit_practical'])) ?? 0)),
      perUnitGeneral: String(Math.round(num(r.get(['هر واحد عمومی', 'واحد عمومی', 'per_unit_general'])) ?? 0)),
      expression: expression || null,
      variables: r.get(['متغیرها', 'variables']) || null,
      note: r.get(['یادداشت', 'توضیحات', 'note']) || null,
      createdByUserId: userId,
      isActive: 1,
    };

    const ins = await db.insert(legacy_tuition_formulas).values(values).onConflictDoUpdate({
      target: [legacy_tuition_formulas.sourceCode, legacy_tuition_formulas.formulaCode, legacy_tuition_formulas.termCode],
      set: { ...values, createdByUserId: userId },
    }).returning({ id: legacy_tuition_formulas.id, created: sql<boolean>`(xmax = 0)` });

    ins[0]?.created ? rep.inserted++ : rep.updated++;
    if (rep.sample.length < 5) rep.sample.push({ formulaCode, term: values.termCode, fixed: values.fixedAmount, expr: values.expression });
  }
  return rep;
}

/** واردسازی صورت‌حساب/شهریهٔ واقعی سیستم قدیمی (مبنای مقایسه) */
export async function importFinancials(sourceCode: string, tables: Table[], fileName: string): Promise<ImportReport> {
  const table = pickTable(tables, [['شماره دانشجویی', 'student_code'], ['کد ترم', 'term_code'], ['شهریه', 'tuition']]);
  if (!table) return { ...emptyReport('legacy-financial', fileName, '-'), errors: [{ row: 0, msg: 'فایل خالی است.' }] };
  const rep = emptyReport('legacy-financial', fileName, table.sheet);

  const miss = missingHeaders(table, [
    { title: 'شماره دانشجویی', aliases: ['شماره دانشجویی', 'student_code', 'شماره دانشجو'] },
    { title: 'کد ترم', aliases: ['کد ترم', 'ترم', 'term_code'] },
  ]);
  if (miss.length) { rep.errors.push({ row: 1, msg: `ستون‌های الزامی یافت نشد: ${miss.join('، ')}` }); return rep; }

  const rows = iterate(table);
  rep.total = rows.length;

  for (const r of rows) {
    const studentCode = r.get(['شماره دانشجویی', 'شماره دانشجو', 'student_code']);
    const termCode = r.get(['کد ترم', 'ترم', 'term_code']);
    if (!studentCode || !termCode) { rep.invalid++; rep.errors.push({ row: r.line, msg: 'شماره دانشجویی و کد ترم الزامی است.' }); continue; }

    const tuition = num(r.get(['شهریه', 'مبلغ شهریه', 'شهریه کل', 'tuition', 'total']));
    if (tuition == null) { rep.invalid++; rep.errors.push({ row: r.line, msg: 'مبلغ شهریهٔ قدیمی خوانده نشد.' }); continue; }

    const values = {
      sourceCode, studentCode, termCode,
      studentName: r.get(['نام دانشجو', 'نام و نام خانوادگی', 'student_name']) || null,
      formulaCode: r.get(['کد فرمول', 'formula_code']) || null,
      degreeCode: r.get(['کد مقطع', 'مقطع', 'degree_code']) || null,
      majorCode: r.get(['کد رشته', 'رشته', 'major_code']) || null,
      entryYear: num(r.get(['سال ورود', 'ورودی', 'entry_year'])) ?? null,
      totalUnits: String(num(r.get(['تعداد واحد', 'واحد', 'units', 'total_units'])) ?? 0),
      theoryUnits: String(num(r.get(['واحد نظری', 'theory_units'])) ?? 0),
      practicalUnits: String(num(r.get(['واحد عملی', 'practical_units'])) ?? 0),
      generalUnits: String(num(r.get(['واحد عمومی', 'general_units'])) ?? 0),
      legacyTuition: String(Math.round(tuition)),
      legacyDiscount: String(Math.round(num(r.get(['تخفیف', 'discount'])) ?? 0)),
      legacyPaid: String(Math.round(num(r.get(['پرداختی', 'پرداخت شده', 'paid'])) ?? 0)),
      raw: JSON.stringify(r.raw),
    };

    const ins = await db.insert(legacy_financial_records).values(values).onConflictDoUpdate({
      target: [legacy_financial_records.sourceCode, legacy_financial_records.studentCode, legacy_financial_records.termCode],
      set: values,
    }).returning({ id: legacy_financial_records.id, created: sql<boolean>`(xmax = 0)` });

    ins[0]?.created ? rep.inserted++ : rep.updated++;
    if (rep.sample.length < 5) rep.sample.push({ studentCode, termCode, tuition: values.legacyTuition, units: values.totalUnits });
  }
  return rep;
}

// ───────────────── مقایسه ─────────────────
export type CompareSummary = {
  runId: number; total: number; matched: number; mismatched: number; unresolved: number;
  sumLegacy: number; sumComputed: number; sumDiff: number;
  worst: { studentCode: string; termCode: string | null; legacy: number; computed: number; diff: number; status: string; detail: string }[];
};

/** اجرای مقایسهٔ «فرمول منتقل‌شده» در برابر «شهریهٔ ثبت‌شدهٔ قدیمی» */
export async function runTuitionCompare(userId: number, params: { sourceCode: string; termCode?: string; tolerance?: number }): Promise<CompareSummary> {
  const { sourceCode } = params;
  const tolerance = Math.max(0, Math.round(params.tolerance ?? 0));
  const termCode = params.termCode?.trim() || undefined;

  const formulas = await db.select().from(legacy_tuition_formulas).where(eq(legacy_tuition_formulas.sourceCode, sourceCode));
  const records = await db.select().from(legacy_financial_records).where(
    termCode
      ? and(eq(legacy_financial_records.sourceCode, sourceCode), eq(legacy_financial_records.termCode, termCode))
      : eq(legacy_financial_records.sourceCode, sourceCode),
  ).orderBy(asc(legacy_financial_records.studentCode));

  const [run] = await db.insert(tuition_compare_runs).values({
    sourceCode, termCode: termCode ?? null, tolerance: String(tolerance), createdByUserId: userId,
  }).returning({ id: tuition_compare_runs.id });

  let matched = 0; let mismatched = 0; let unresolved = 0;
  let sumLegacy = 0; let sumComputed = 0;
  const items: typeof tuition_compare_items.$inferInsert[] = [];

  for (const rec of records) {
    const legacyAmount = Number(rec.legacyTuition ?? 0);
    sumLegacy += legacyAmount;

    const f = matchFormula(formulas, {
      formulaCode: rec.formulaCode, termCode: rec.termCode, degreeCode: rec.degreeCode,
      majorCode: rec.majorCode, entryYear: rec.entryYear,
    });
    if (!f) {
      unresolved++;
      items.push({
        runId: run.id, studentCode: rec.studentCode, studentName: rec.studentName, termCode: rec.termCode,
        formulaCode: rec.formulaCode, totalUnits: rec.totalUnits, legacyAmount: String(legacyAmount),
        computedAmount: '0', diff: String(-legacyAmount), status: 'NO_FORMULA',
        detail: 'هیچ فرمولی با ترم/مقطع/رشتهٔ این ردیف منطبق نشد.',
      });
      continue;
    }

    try {
      const { amount, detail } = computeTuition(f, {
        units: Number(rec.totalUnits ?? 0), theoryUnits: Number(rec.theoryUnits ?? 0),
        practicalUnits: Number(rec.practicalUnits ?? 0), generalUnits: Number(rec.generalUnits ?? 0),
        entryYear: rec.entryYear ?? 0, discount: Number(rec.legacyDiscount ?? 0),
      });
      const diff = amount - legacyAmount;
      sumComputed += amount;
      const ok = Math.abs(diff) <= tolerance;
      ok ? matched++ : mismatched++;
      items.push({
        runId: run.id, studentCode: rec.studentCode, studentName: rec.studentName, termCode: rec.termCode,
        formulaCode: f.formulaCode, totalUnits: rec.totalUnits, legacyAmount: String(legacyAmount),
        computedAmount: String(amount), diff: String(diff), status: ok ? 'MATCH' : 'DIFF', detail,
      });
    } catch (e) {
      unresolved++;
      items.push({
        runId: run.id, studentCode: rec.studentCode, studentName: rec.studentName, termCode: rec.termCode,
        formulaCode: f.formulaCode, totalUnits: rec.totalUnits, legacyAmount: String(legacyAmount),
        computedAmount: '0', diff: String(-legacyAmount), status: 'ERROR', detail: (e as Error).message,
      });
    }
  }

  for (let i = 0; i < items.length; i += 500) await db.insert(tuition_compare_items).values(items.slice(i, i + 500));

  const sumDiff = sumComputed - sumLegacy;
  await db.update(tuition_compare_runs).set({
    totalRows: records.length, matched, mismatched, unresolved,
    sumLegacy: String(Math.round(sumLegacy)), sumComputed: String(Math.round(sumComputed)), sumDiff: String(Math.round(sumDiff)),
  }).where(eq(tuition_compare_runs.id, run.id));

  const worst = items
    .filter(i => i.status !== 'MATCH')
    .sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff)))
    .slice(0, 20)
    .map(i => ({
      studentCode: i.studentCode, termCode: i.termCode ?? null, legacy: Number(i.legacyAmount),
      computed: Number(i.computedAmount), diff: Number(i.diff), status: i.status, detail: String(i.detail ?? ''),
    }));

  return { runId: run.id, total: records.length, matched, mismatched, unresolved, sumLegacy, sumComputed, sumDiff, worst };
}

export async function listCompareRuns(limit = 20) {
  return db.select().from(tuition_compare_runs).orderBy(desc(tuition_compare_runs.id)).limit(limit);
}

export async function compareItems(runId: number, status?: string) {
  const where = status && status !== 'ALL'
    ? and(eq(tuition_compare_items.runId, runId), eq(tuition_compare_items.status, status))
    : eq(tuition_compare_items.runId, runId);
  return db.select().from(tuition_compare_items).where(where).orderBy(desc(sql`abs(${tuition_compare_items.diff})`)).limit(1000);
}

/**
 * اعمال فرمول‌های قدیمی روی «قواعد مالی ترم» سامانهٔ جدید.
 * ترم و مقطع از طریق جدول تطبیق کدها ترجمه می‌شوند؛ هر فرمولی که ترم/مقطعش
 * تطبیق نخورده باشد رد می‌شود و در گزارش می‌آید (هیچ حدسی زده نمی‌شود).
 */
export async function applyFormulasToRules(sourceCode: string, formulaIds?: number[]): Promise<{ applied: number; skipped: { formulaCode: string; reason: string }[] }> {
  const where = formulaIds?.length
    ? and(eq(legacy_tuition_formulas.sourceCode, sourceCode), inArray(legacy_tuition_formulas.id, formulaIds))
    : eq(legacy_tuition_formulas.sourceCode, sourceCode);
  const formulas = await db.select().from(legacy_tuition_formulas).where(where);

  const termMap = await resolverFor(sourceCode, 'TERM');
  const degreeMap = await resolverFor(sourceCode, 'DEGREE');
  const terms = await db.select({ id: academic_terms.id, code: academic_terms.termCode }).from(academic_terms);
  const degrees = await db.select({ id: degree_level_configs.id, code: degree_level_configs.code }).from(degree_level_configs);

  let applied = 0;
  const skipped: { formulaCode: string; reason: string }[] = [];

  for (const f of formulas) {
    if (!f.termCode) { skipped.push({ formulaCode: f.formulaCode, reason: 'کد ترم ندارد (فرمول عمومی).' }); continue; }
    const mappedTerm = termMap.get(norm(f.termCode));
    const termId = mappedTerm?.id ?? terms.find(t => norm(t.code) === norm(f.termCode ?? ''))?.id ?? null;
    if (!termId) { skipped.push({ formulaCode: f.formulaCode, reason: `ترم «${f.termCode}» تطبیق نخورده — در میز تطبیق کدها مشخص کنید.` }); continue; }

    if (!f.degreeCode) { skipped.push({ formulaCode: f.formulaCode, reason: 'کد مقطع ندارد؛ برای قاعدهٔ مالی ترم، مقطع لازم است.' }); continue; }
    const mappedDeg = degreeMap.get(norm(f.degreeCode));
    const degreeId = mappedDeg?.id
      ?? degrees.find(d => norm(d.code) === norm(mappedDeg?.code ?? f.degreeCode ?? ''))?.id
      ?? null;
    if (!degreeId) { skipped.push({ formulaCode: f.formulaCode, reason: `مقطع «${f.degreeCode}» تطبیق نخورده — در میز تطبیق کدها مشخص کنید.` }); continue; }

    const perUnit = Math.max(Number(f.perUnitTheory ?? 0), Number(f.perUnitGeneral ?? 0), Number(f.perUnitPractical ?? 0));
    const existing = await db.select({ id: term_financial_rules.id }).from(term_financial_rules)
      .where(and(eq(term_financial_rules.termId, termId), eq(term_financial_rules.degreeLevelId, degreeId))).limit(1);

    if (existing.length) {
      await db.update(term_financial_rules).set({
        fixedTuition: String(Math.round(Number(f.fixedAmount ?? 0))),
        perUnitTuition: String(Math.round(perUnit)),
      }).where(eq(term_financial_rules.id, existing[0].id));
    } else {
      await db.insert(term_financial_rules).values({
        termId, degreeLevelId: degreeId,
        fixedTuition: String(Math.round(Number(f.fixedAmount ?? 0))),
        perUnitTuition: String(Math.round(perUnit)),
        advancePaymentRequired: String(Math.round(Number(f.fixedAmount ?? 0) / 2)),
      });
    }
    applied++;
  }
  return { applied, skipped };
}

#!/usr/bin/env node
/**
 * واردسازی «کد ثابت / کد متغیر شهریه» از سامانهٔ قدیمی سما → دیتابیس
 * ────────────────────────────────────────────────────────────────────────────────
 * ورودی: خروجی scripts/extract-uems-tuition.mjs
 *   uems_tuition_rules.tsv
 *   ستونها: majorCode entryYear srcTerm srcEntryTerm srcCourseType
 *           srcUPriceCode srcFPriceCode theory practical general fixed
 *
 * خروجی: SQL ایدمپوتنت که جدول `tuition_price_code_templates` (مهاجرت ۰۱۳۶)
 * و ستون `tuition_term_tariff."fPriceCode"` را پُر میکند. چون FPrice_code
 * پیشتر هیچجا ذخیره نشده بود، این تنها راه درستکردنِ «کد ثابت» سربرگ
 * کارنامهٔ مالی نوع الف است — لایهٔ نمایش هرگز عددی را سختکد نمیکند.
 *
 * قالبها بر اساس **نیمسال ورود** دانشجو کلید میخورند:
 *   (universityId, majorId, degreeLevelId, entryYear, entryTerm)
 *   ۰ / NULL = wildcard (همهٔ سالها / نیمسالها / مقاطع).
 *
 *   node scripts/import-tuition-price-codes.mjs --in uems_tuition_rules.tsv --out sql/price-codes.sql
 *   node scripts/import-tuition-price-codes.mjs --in uems_tuition_rules.tsv --apply --university 1
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
  }
}
const INPUT = args.in;
const OUT = args.out || 'sql/tuition-price-codes.sql';
const UNI = Number(args.university || 1);
const APPLY = args.apply === 'true';
const SOURCE = args.source || 'SAMA_TERM_PRICE';

if (!INPUT) {
  console.error('usage: node scripts/import-tuition-price-codes.mjs --in <uems_tuition_rules.tsv> [--out <file.sql>] [--apply] [--university 1]');
  process.exit(1);
}

const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const clean = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number(clean(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** نیمسال ورود: آخرین رقم «TermEnter» (۱=مهر، ۲=بهمن، ۳=تابستان)؛ نامعتبر → ۰ (wildcard) */
const entryTermOf = (v) => {
  const s = clean(v);
  if (!s) return 0;
  const d = Number(s.slice(-1));
  return [1, 2, 3].includes(d) ? d : 0;
};

const readTsv = (path) =>
  readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));

/** پرتکرارترین مقدار غیرخالی یک ستون در گروه (رأیگیری، مثل کد گروه تعرفه) */
const vote = (values) => {
  const m = new Map();
  for (const v of values) {
    const s = clean(v);
    if (!s) continue;
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  let best = null;
  let n = 0;
  for (const [s, count] of m) if (count > n) { best = s; n = count; }
  return best;
};

async function main() {
  const rows = readTsv(INPUT);
  const header = rows[0].map((h) => clean(h));
  const idx = (name) => header.indexOf(name);
  const I = {
    majorCode: idx('majorCode'),
    entryYear: idx('entryYear'),
    srcEntryTerm: idx('srcEntryTerm'),
    srcUPriceCode: idx('srcUPriceCode'),
    srcFPriceCode: idx('srcFPriceCode'),
  };
  if (Object.values(I).some((i) => i < 0)) {
    console.error('TSV header mismatch. Expected output of extract-uems-tuition.mjs:', header.join(' | '));
    process.exit(1);
  }

  // کلید = (کد رشته، سال ورود، نیمسال ورود) — همان «قالب نیمسال ورود»
  const groups = new Map();
  let read = 0;
  for (const c of rows.slice(1)) {
    const majorCode = clean(c[I.majorCode]);
    const entryYear = num(c[I.entryYear]);
    if (!majorCode || !entryYear || majorCode === '0') continue;
    const key = `${majorCode}|${entryYear}|${entryTermOf(c[I.srcEntryTerm])}`;
    const g = groups.get(key) || { majorCode, entryYear, entryTerm: entryTermOf(c[I.srcEntryTerm]), fixed: [], variable: [] };
    g.fixed.push(c[I.srcFPriceCode]);
    g.variable.push(c[I.srcUPriceCode]);
    groups.set(key, g);
    read++;
  }

  const parts = [];
  parts.push('-- کدهای شهریهٔ کارنامهٔ مالی نوع الف — تولیدشده با scripts/import-tuition-price-codes.mjs');
  parts.push(`-- منبع: ${INPUT} | دانشگاه: ${UNI} | ردیفها: ${read} | قالبها: ${groups.size}`);
  parts.push('BEGIN;');

  let written = 0;
  for (const g of groups.values()) {
    const fixed = vote(g.fixed);
    const variable = vote(g.variable);
    if (!fixed && !variable) continue;
    const setFixed = fixed ? q(fixed) : 'NULL';
    const setVariable = variable ? q(variable) : 'NULL';
    const majorFilter = `trim(m."majorCode") = ${q(g.majorCode)} AND m."universityId" = ${UNI}`;

    // ۱) ردیفهای موجود بهروز شوند (شامل بذر مهاجرت ۰۱۳۶ و نمونهٔ تأییدشده).
    parts.push(
      `UPDATE "tuition_price_code_templates" x\n` +
      `SET "fixedPriceCode"           = COALESCE(${setFixed}, x."fixedPriceCode"),\n` +
      `    "initialFixedPriceCode"    = COALESCE(${setFixed}, x."initialFixedPriceCode", x."fixedPriceCode"),\n` +
      `    "initialVariablePriceCode" = COALESCE(${setVariable}, x."initialVariablePriceCode"),\n` +
      `    source = ${q(SOURCE)}, note = ${q('واردشده از TermPrice سما (FPrice_code / UPrice_code)')}, "updatedAt" = now()\n` +
      `FROM "majors" m\n` +
      `WHERE ${majorFilter}\n` +
      `  AND x."universityId" = ${UNI} AND x."majorId" = m."id"\n` +
      `  AND x."entryYear" = ${g.entryYear} AND x."entryTerm" IN (0, ${g.entryTerm});`,
    );

    // ۲) اگر قالبی نبود، یکی با degreeLevelId=NULL (wildcard مقطع) ساخته شود.
    parts.push(
      `INSERT INTO "tuition_price_code_templates"\n` +
      `  ("universityId","majorId","degreeLevelId","entryYear","entryTerm",\n` +
      `   "fixedPriceCode","initialFixedPriceCode","initialVariablePriceCode",source,note,"updatedAt")\n` +
      `SELECT ${UNI}, m."id", NULL, ${g.entryYear}, ${g.entryTerm},\n` +
      `       ${setFixed}, ${setFixed}, ${setVariable}, ${q(SOURCE)},\n` +
      `       ${q('واردشده از TermPrice سما (FPrice_code / UPrice_code)')}, now()\n` +
      `FROM "majors" m\n` +
      `WHERE ${majorFilter}\n` +
      `  AND NOT EXISTS (\n` +
      `    SELECT 1 FROM "tuition_price_code_templates" z\n` +
      `    WHERE COALESCE(z."universityId",0) = ${UNI}\n` +
      `      AND COALESCE(z."majorId",0) = m."id"\n` +
      `      AND COALESCE(z."degreeLevelId",0) = 0\n` +
      `      AND z."entryYear" = ${g.entryYear} AND z."entryTerm" = ${g.entryTerm}\n` +
      `  );`,
    );

    // ۳) کد ثابتِ همان سال در جدول تعرفه هم ذخیره شود تا پشتیبان حلگر کار کند.
    if (fixed) {
      parts.push(
        `UPDATE "tuition_term_tariff" t SET "fPriceCode" = ${setFixed}\n` +
        `FROM "majors" m\n` +
        `WHERE ${majorFilter}\n` +
        `  AND t."universityId" = ${UNI} AND t."majorId" = m."id"\n` +
        `  AND t."entryYear" = ${g.entryYear} AND t."fPriceCode" IS NULL;`,
      );
    }
    written++;
  }

  parts.push('COMMIT;');
  const sql = parts.join('\n\n') + '\n';

  if (APPLY) {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is required for --apply');
      process.exit(1);
    }
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(sql);
      const { rows: check } = await pool.query(
        `SELECT count(*)::int AS n FROM "tuition_price_code_templates" WHERE "fixedPriceCode" IS NOT NULL`,
      );
      console.log(`applied: ${written} templates; templates with a fixed code = ${check[0].n}`);
    } finally {
      await pool.end();
    }
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql, 'utf8');
  console.log(`${read} rows in ${written} templates -> ${OUT}`);
}

main().catch((e) => {
  console.error('failed:', e);
  process.exit(1);
});

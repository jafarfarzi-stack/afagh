#!/usr/bin/env node
/**
 * درون‌ریزی تعرفهٔ تفصیلی سما → جدول `tuition_term_tariff` + ستون `courses.legacyMaliType`
 * ────────────────────────────────────────────────────────────────────────────────
 * ورودی: خروجی scripts/extract-uems-tariff.mjs
 *   ▸ --tariff  uems_term_tariff.tsv   (termCode, majorCode, entryYear, maliType, th, op, uPriceCode)
 *   ▸ --lessons uems_lesson_types.tsv  (lessonCode, maliType, unit, th, oh)
 *
 * اجرای مکرر idempotent است (اول ردیف‌های همین منبع پاک می‌شوند). فایل SQL تولید
 * می‌شود تا با psql روی سرور اجرا شود؛ با `--apply` مستقیم هم روی DATABASE_URL
 * اجرا می‌شود.
 *
 *   node scripts/import-uems-tariff.mjs --tariff <a.tsv> --lessons <b.tsv> --out sql/uems-tariff.sql
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
const TARIFF = args.tariff;
const LESSONS = args.lessons;
const OUT = args.out || 'sql/uems-tariff.sql';
const UNI = Number(args.university || 1);
const APPLY = args.apply === 'true';
const SOURCE = args.source || 'SAMA';

if (!TARIFF) {
  console.error('usage: node scripts/import-uems-tariff.mjs --tariff <file.tsv> [--lessons <file.tsv>] [--out <file.sql>] [--apply] [--university 1]');
  process.exit(1);
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, '') || 0);
  return Number.isFinite(n) ? n : 0;
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const fmt = (n) => String(Math.round(num(n) * 100) / 100);

const readTsv = (path) =>
  readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));

async function main() {
  // ── ۱) تعرفهٔ تفصیلی: گروه‌بندی بر اساس (سالِ تعرفه، رشته، سالِ ورود) ──
  // کدِ قیمت سالانه است، پس نیمسال‌های یک سال در یک گروه جمع می‌شوند.
  const groups = new Map();
  let tariffRows = 0;
  for (const c of readTsv(TARIFF)) {
    const [termYear, srcTermCode, majorCode, entryYear, maliType, th, op, uPriceCode] = c;
    if (!termYear || !majorCode || !entryYear || !maliType) continue;
    if (majorCode === '0') continue;
    if (num(th) === 0 && num(op) === 0) continue;
    const key = `${termYear}|${majorCode}|${entryYear}`;
    const g = groups.get(key) || { termCode: srcTermCode || termYear, rows: [] };
    g.rows.push({ maliType, th: fmt(th), op: fmt(op), uPriceCode: uPriceCode || null });
    groups.set(key, g);
    tariffRows++;
  }

  const parts = [];
  parts.push('-- تعرفهٔ تفصیلی سما — تولیدشده با scripts/import-uems-tariff.mjs');
  parts.push(`-- منبع: ${TARIFF} | دانشگاه: ${UNI} | ردیف قیمت: ${tariffRows} | گروه (سال×رشته×ورود): ${groups.size}`);
  parts.push('BEGIN;');
  parts.push(`DELETE FROM "tuition_term_tariff" WHERE "source" = ${q(SOURCE)} AND "universityId" = ${UNI};`);

  for (const [key, g] of groups) {
    const [termYear, majorCode, entryYear] = key.split('|');
    const values = g.rows
      .map((r) => `(${r.maliType}, ${r.th}, ${r.op}, ${r.uPriceCode ? q(r.uPriceCode) : 'NULL'})`)
      .join(',');
    parts.push(
      `INSERT INTO "tuition_term_tariff" ("universityId","termCode","termYear","majorId","entryYear","maliType","thPrice","opPrice","uPriceCode","source")\n` +
        `SELECT ${UNI}, ${q(g.termCode)}, ${Number(termYear)}, m."id", ${Number(entryYear)}, v.mt, v.th, v.op, v.upc, ${q(SOURCE)}\n` +
        `FROM "majors" m, (VALUES ${values}) AS v(mt, th, op, upc)\n` +
        `WHERE trim(m."majorCode") = ${q(majorCode)} AND m."universityId" = ${UNI};`,
    );
  }

  // ── ۲) نوع درس مالی هر درس ──
  let lessonRows = 0;
  if (LESSONS) {
    const pairs = [];
    for (const c of readTsv(LESSONS)) {
      const [lessonCode, maliType] = c;
      if (!lessonCode || !maliType) continue;
      pairs.push(`(${q(lessonCode)}, ${Number(maliType)})`);
      lessonRows++;
    }
    for (let i = 0; i < pairs.length; i += 500) {
      const chunk = pairs.slice(i, i + 500);
      parts.push(
        `UPDATE "courses" c SET "legacyMaliType" = v.mt\n` +
          `FROM (VALUES ${chunk.join(',')}) AS v(code, mt)\n` +
          `WHERE c."code" = v.code AND c."universityId" = ${UNI};`,
      );
    }
  }

  parts.push('COMMIT;');
  const sql = parts.join('\n') + '\n';

  if (APPLY) {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is required for --apply');
      process.exit(1);
    }
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(sql);
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "tuition_term_tariff" WHERE "universityId" = $1 AND "source" = $2`,
        [UNI, SOURCE],
      );
      console.log(`applied: tariff rows in DB = ${rows[0].n}, lessons = ${lessonRows}`);
    } finally {
      await pool.end();
    }
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql, 'utf8');
  console.log(`${tariffRows} price rows in ${groups.size} groups + ${lessonRows} lessons -> ${OUT}`);
}

main().catch((e) => {
  console.error('failed:', e);
  process.exit(1);
});

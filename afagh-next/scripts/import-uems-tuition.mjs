#!/usr/bin/env node
/**
 * درون‌ریزی تعرفهٔ شهریهٔ سما (خروجی extract-uems-tuition.mjs) → جدول tuition_rules
 * ─────────────────────────────────────────────────────────────────────────────
 * هر ردیف TSV = یک قاعدهٔ شهریه برای (رشته، سالِ ورود):
 *   ▸ perUnitTheory / perUnitPractical / perUnitGeneral  ← نرخ هر واحد
 *   ▸ fixedAmount                                        ← شهریهٔ ثابت
 *
 * کلید یکتا: code = «UEMS-<majorCode>-<entryYear>-<majorId>»؛ چون ممکن است
 * چند رکورد «رشته» با یک کد ولی مقاطع متفاوت وجود داشته باشد (مثلاً ۲۰ با
 * degreeLevelId=1 و =15)، هر رکورد قاعدهٔ خودش را می‌گیرد. اجرای مکرر
 * idempotent است (اول همهٔ قواعد همین منبع حذف می‌شوند).
 *
 * علاوه بر قواعد رشته‌محور، «قاعدهٔ پشتیبان» هم به ازای هر سالِ ورود ساخته
 * می‌شود (بدون رشته/مقطع، priority بالا) تا دانشجویانی که رشته‌شان در جدول
 * تعرفهٔ مبدأ نیست، شارژ صفر نگیرند؛ قاعدهٔ رشته‌محور همیشه خاص‌تر است و
 * برنده می‌شود.
 *
 * ⚠️ degreeLevelId عمداً تهی می‌ماند: در جدول دانشجو، یک رشته با شناسه‌های
 * مقطع متفاوت (۱۵..۲۴ و ۱۶۶..۱۷۰) ثبت شده و قیدِ مقطع، قاعده را بی‌اثر می‌کرد.
 *
 * اجرا:
 *   node scripts/import-uems-tuition.mjs --in <file.tsv> --out sql/uems-tuition.sql
 *   node scripts/import-uems-tuition.mjs --in <file.tsv> --apply            # با DATABASE_URL
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
const IN = args.in;
const OUT = args.out || 'sql/uems-tuition.sql';
const UNI = Number(args.university || 1);
const APPLY = args.apply === 'true';
const RESET = args.reset !== 'false'; // پیش‌فرض: حذف قواعد قبلیِ همین منبع
const FALLBACK = args.fallback !== 'false';
const SUMMER = args.summer !== 'false';

if (!IN) {
  console.error('usage: node scripts/import-uems-tuition.mjs --in <file.tsv> [--out <file.sql>] [--apply] [--university 1] [--reset false] [--fallback false]');
  process.exit(1);
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, '') || 0);
  return Number.isFinite(n) ? n : 0;
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const fmt = (n) => String(Math.round(num(n) * 100) / 100);

const COLS =
  '("code","title","degreeLevelId","majorId","termType","offeringType",' +
  '"entryYearFrom","entryYearTo","fixedAmount","perUnitTheory","perUnitPractical","perUnitGeneral",' +
  '"priority","isActive","universityId")';

function parse(tsv) {
  const lines = tsv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const cells = l.split('\t');
    const row = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

/** نرخ‌ها را قابل‌استفاده می‌کند: صفر فقط وقتی هر دو نظری/عملی صفرند (ردیف بی‌تعرفه) */
function rates(r) {
  let theory = num(r.theory);
  let practical = num(r.practical);
  let general = num(r.general);
  if (theory === 0 && practical === 0) return null;
  if (practical === 0) practical = theory;
  if (theory === 0) theory = practical;
  if (general === 0) general = theory;
  return { theory, practical, general, fixed: num(r.fixed) };
}

async function main() {
  const rowsAll = parse(readFileSync(IN, 'utf8'));
  const rows = [];
  const seen = new Set();
  const skipped = { noMajor: 0, dup: 0, noRate: 0 };

  for (const r of rowsAll) {
    const majorCode = String(r.majorCode ?? '').trim();
    const entryYear = String(r.entryYear ?? '').trim();
    if (!majorCode || majorCode === '0' || !/^\d{4}$/.test(entryYear)) {
      skipped.noMajor++;
      continue;
    }
    const rr = rates(r);
    if (!rr) {
      skipped.noRate++;
      continue;
    }
    const key = `${majorCode}-${entryYear}`;
    if (seen.has(key)) {
      skipped.dup++;
      continue;
    }
    seen.add(key);
    rows.push({ majorCode, entryYear: Number(entryYear), ...rr });
  }

  const parts = [];
  parts.push('-- تعرفهٔ شهریهٔ سما — تولیدشده با scripts/import-uems-tuition.mjs');
  parts.push(`-- منبع: ${IN}`);
  parts.push(`-- دانشگاه: ${UNI} | قواعد رشته‌محور: ${rows.length} | ردیف‌های بی‌تعرفه/تکراری: ${skipped.noRate}/${skipped.dup}`);
  parts.push('BEGIN;');
  if (RESET) {
    parts.push(`DELETE FROM "tuition_rules" WHERE "code" LIKE 'UEMS-%' AND "universityId" = ${UNI};`);
  }

  for (const r of rows) {
    parts.push(
      `INSERT INTO "tuition_rules" ${COLS}\n` +
        `SELECT 'UEMS-' || trim(m."majorCode") || '-' || ${r.entryYear} || '-' || m."id", ` +
        `${q(`تعرفهٔ سما — رشتهٔ ${r.majorCode} ورودی ${r.entryYear}`)}, NULL, m."id", NULL, NULL, ` +
        `${r.entryYear}, ${r.entryYear}, ${fmt(r.fixed)}, ${fmt(r.theory)}, ${fmt(r.practical)}, ${fmt(r.general)}, 100, 1, ${UNI}\n` +
        `FROM "majors" m WHERE trim(m."majorCode") = ${q(r.majorCode)} AND m."universityId" = ${UNI};`,
    );
  }

  // ── ترم تابستان: شهریهٔ ثابت نصف میشود (پرچم IsHalfTerm در سما) ──────
  // نرخ هر واحد همان نرخ سال است؛ فقط ثابت نصف می‌شود. قاعده با termType='SUMMER'
  // خاص‌تر از قاعدهٔ عمومی است، پس در ترم تابستان همین انتخاب می‌شود.
  let summerCount = 0;
  if (SUMMER) {
    for (const r of rows) {
      const sumTitle = `تعرفهٔ سما — رشتهٔ ${r.majorCode} ورودی ${r.entryYear} (تابستان: ثابت نصف)`;
      parts.push(
        `INSERT INTO "tuition_rules" ${COLS}\n` +
          `SELECT 'UEMS-SUM-' || trim(m."majorCode") || '-' || ${r.entryYear} || '-' || m."id", ` +
          `${q(sumTitle)}, NULL, m."id", 'SUMMER', NULL, ` +
          `${r.entryYear}, ${r.entryYear}, ${fmt(r.fixed / 2)}, ${fmt(r.theory)}, ${fmt(r.practical)}, ${fmt(r.general)}, 100, 1, ${UNI}\n` +
          `FROM "majors" m WHERE trim(m."majorCode") = ${q(r.majorCode)} AND m."universityId" = ${UNI};`,
      );
      summerCount++;
    }
  }

  // ── قواعد پشتیبان: میانگین همهٔ رشته‌ها به ازای سالِ ورود ────────────
  let fallbackCount = 0;
  if (FALLBACK && rows.length > 0) {
    const byYear = new Map();
    for (const r of rows) {
      const b = byYear.get(r.entryYear) || { theory: 0, practical: 0, general: 0, fixed: 0, n: 0 };
      b.theory += r.theory; b.practical += r.practical; b.general += r.general; b.fixed += r.fixed; b.n += 1;
      byYear.set(r.entryYear, b);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const avg = (y) => {
      const b = byYear.get(y);
      return { theory: b.theory / b.n, practical: b.practical / b.n, general: b.general / b.n, fixed: b.fixed / b.n };
    };
    const nearest = (y) => years.reduce((best, c) => (Math.abs(c - y) < Math.abs(best - y) ? c : best), years[0]);
    const from = Number(args['fallback-from'] ?? years[0] - 8);
    const to = Number(args['fallback-to'] ?? years[years.length - 1] + 2);
    for (let y = from; y <= to; y++) {
      const a = avg(nearest(y));
      parts.push(
        `INSERT INTO "tuition_rules" ${COLS}\n` +
          `SELECT 'UEMS-ANY-${y}', ${q(`تعرفهٔ سما — پشتیبان (میانگین رشته‌ها) ورودی ${y}`)}, NULL, NULL, NULL, NULL, ` +
          `${y}, ${y}, ${fmt(a.fixed)}, ${fmt(a.theory)}, ${fmt(a.practical)}, ${fmt(a.general)}, 900, 1, ${UNI};`,
      );
      fallbackCount++;
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
      const { rows: cnt } = await pool.query(
        `SELECT count(*)::int AS n FROM "tuition_rules" WHERE "code" LIKE 'UEMS-%' AND "universityId" = $1`,
        [UNI],
      );
      console.log(`applied ${rows.length} major rules + ${fallbackCount} fallback rules; tuition_rules(UEMS) now = ${cnt[0].n}`);
    } finally {
      await pool.end();
    }
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql, 'utf8');
  console.log(`${rows.length} major rules + ${summerCount} summer rules + ${fallbackCount} fallback rules -> ${OUT}`);
}

main().catch((e) => {
  console.error('failed:', e);
  process.exit(1);
});

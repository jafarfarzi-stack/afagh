#!/usr/bin/env node
/**
 * شکستنِ ردیف‌های ادغام‌شدهٔ «تخفیف بیتس» به سه زیرنوعِ سما.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  چرا؟
 *  سما بیتسِ هر نیمسال را در سه ستونِ جدا نگه می‌داشت:
 *    TermAms.Fix_Bates   → TUITION_BATES_FIXED    (بیتسِ شهریهٔ ثابت)
 *    TermAms.Units_Bates → TUITION_BATES_VARIABLE (بیتسِ شهریهٔ متغیر)
 *    TermAms.Mab_Bates   → TUITION_BATES_AMOUNT   (بیتسِ مبلغی)
 *  مهاجرتِ سال گذشته (`insert-tuition-bates.mjs`) هر سه را در **یک** ردیفِ
 *  `TUITION_BATES` جمع کرد. در کارنامهٔ مالی این یعنی کارشناس مالی فقط یک
 *  عددِ کلیِ «تخفیف بیتس» می‌دید و نمی‌توانست با سما تطبیق بدهد.
 *
 *  این اسکریپت هر ردیفِ ادغام‌شده را با سه ردیفِ زیرنوع جایگزین می‌کند.
 *  ⭐ مبلغ و علامت عوض نمی‌شود ⇒ ماندهٔ هیچ دانشجویی جابه‌جا نمی‌شود.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  ایمنی
 *  ▸ idempotent: اگر زیرنوع‌های همان referenceId از قبل باشند، ردیفِ
 *    ادغام‌شده دست‌نخورده می‌ماند.
 *  ▸ فقط درون یک تراکنش؛ در صورت خطا ROLLBACK.
 *  ▸ `--dry` (پیش‌فرض) فقط گزارش می‌دهد. برای نوشتن: `--apply`.
 *  ▸ فقط ردیف‌هایی که در TermAms.tsv معادلِ سما دارند دست می‌خورند؛ ردیفِ
 *    بی‌معادل دست‌نخورده می‌ماند (و در گزارش نهایی فهرست می‌شود).
 *
 *  اجرا (روی سرور):
 *    node scripts/split-tuition-bates.mjs --dir /tmp/lp2v2/fin_export_uems \
 *      --uni 1 --db-host <ip>            # خشک
 *    node scripts/split-tuition-bates.mjs --dir /tmp/lp2v2/fin_export_uems \
 *      --uni 1 --db-host <ip> --apply
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
  }
}
const UNI = Number(args.uni || 1);
const DIR = args.dir || '/tmp/lp2v2/fin_export_uems';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.3';
const APPLY = 'apply' in args;

const req = createRequire(resolve(DIR, '..', 'package.json'));
const { Pool } = req('pg');
const envTxt = readFileSync(DB_ENV, 'utf8');
const m = envTxt.match(/^POSTGRES_PASSWORD=(.*)$/m);
const pool = new Pool({
  host: DB_HOST,
  port: 5432,
  user: 'afagh',
  password: m[1].replace(/\r$/, ''),
  database: 'afagh_db',
  max: 5,
});
const q = async (t, p) => (await pool.query(t, p)).rows;

const readTsv = (name) => {
  const p = join(DIR, name);
  if (!existsSync(p)) throw new Error('missing ' + p);
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split('\t');
  return { header, rows: lines.slice(1).map((l) => l.split('\t')) };
};
const col = (row, header, ...names) => {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0 && i < row.length) return String(row[i] ?? '').trim();
  }
  return '';
};
const num = (s) => {
  const v = Number(String(s ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

/** زیرنوع‌ها و ترتیبِ درجشان (ترتیبِ سما) */
const SUBTYPES = [
  { type: 'TUITION_BATES_FIXED', col: 'Fix_Bates', label: 'تخفیف بیتسِ شهریهٔ ثابت (سما)' },
  { type: 'TUITION_BATES_VARIABLE', col: 'Units_Bates', label: 'تخفیف بیتسِ شهریهٔ متغیر (سما)' },
  { type: 'TUITION_BATES_AMOUNT', col: 'Mab_Bates', label: 'تخفیف بیتسِ مبلغی (سما)' },
];

(async () => {
  const tams = readTsv('TermAms.tsv');

  // ── نگاشت referenceId ⇒ اجزای سه‌گانهٔ بیتس ──
  const byRef = new Map();
  for (const r of tams.rows) {
    const amsId = col(r, tams.header, 'TermAmsId');
    if (!amsId) continue;
    const parts = SUBTYPES.map((s) => ({ ...s, amount: num(col(r, tams.header, s.col)) }));
    const total = parts.reduce((a, p) => a + p.amount, 0);
    if (!total) continue;
    const ref = Number(amsId);
    if (!Number.isSafeInteger(ref) || ref < 0 || ref > 2000000000) continue;
    byRef.set(ref, parts);
  }

  // ── ردیف‌های ادغام‌شدهٔ موجود ──
  const merged = await q(
    `SELECT id, "studentId", "termId", amount, "referenceId", description
       FROM student_ledger
      WHERE "transactionType" = 'TUITION_BATES' AND "universityId" = $1 AND "referenceId" IS NOT NULL`,
    [UNI],
  );

  // ── زیرنوع‌هایی که از قبل ساخته شده‌اند (idempotency) ──
  const done = new Set(
    (
      await q(
        `SELECT DISTINCT "referenceId" FROM student_ledger
          WHERE "transactionType" = ANY($2) AND "universityId" = $1 AND "referenceId" IS NOT NULL`,
        [UNI, SUBTYPES.map((s) => s.type)],
      )
    ).map((x) => Number(x.referenceId)),
  );

  const stat = { candidates: 0, planned: 0, skipAlready: 0, skipNoSource: 0, skipNoRef: 0, deleted: 0, inserted: 0 };
  const plan = [];
  const unmatched = [];

  for (const row of merged) {
    stat.candidates++;
    const ref = Number(row.referenceId);
    if (!Number.isSafeInteger(ref)) { stat.skipNoRef++; continue; }
    if (done.has(ref)) { stat.skipAlready++; continue; }
    const parts = byRef.get(ref);
    if (!parts) {
      // معادلِ سما پیدا نشد ⇒ دست نمی‌زنیم (بدون ریسک)
      stat.skipNoSource++;
      unmatched.push({ id: row.id, ref, amount: row.amount });
      continue;
    }
    plan.push({ id: row.id, ref, parts: parts.filter((p) => p.amount > 0) });
  }

  console.log(`== SPLIT TUITION_BATES (uni ${UNI}) ${APPLY ? '[APPLY]' : '[DRY]'} ==`);
  console.log(`merged rows in DB : ${stat.candidates}`);
  console.log(`planned splits    : ${plan.length}`);
  console.log(`skip (already)    : ${stat.skipAlready}`);
  console.log(`skip (no source)  : ${stat.skipNoSource}`);
  if (unmatched.length) {
    console.log(`⚠ ردیف‌های بدون معادل سما (دست‌نخورده می‌مانند): ${unmatched.length}`);
    for (const u of unmatched.slice(0, 10)) console.log(`   id=${u.id} ref=${u.ref} amount=${u.amount}`);
  }
  for (const p of plan.slice(0, 8)) {
    console.log(
      `   row#${p.id} ref=${p.ref} → ${p.parts.map((x) => `${x.type}=${x.amount}`).join(' + ')}`,
    );
  }
  if (!APPLY) {
    console.log('\n(خشک) برای نوشتن، --apply را اضافه کنید.');
    await pool.end();
    return;
  }

  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    for (const p of plan) {
      // ۱) ردیفِ ادغام‌شده حذف و اجزای آن جایگزین می‌شود
      //    ⚠ شناسه‌ها باید **قبل** از حذف خوانده شوند.
      const orig = (
        await tx.query(
          `SELECT "studentId", "termId" FROM student_ledger WHERE id = $1 AND "transactionType" = 'TUITION_BATES'`,
          [p.id],
        )
      ).rows[0];
      if (!orig) continue;
      await tx.query(`DELETE FROM student_ledger WHERE id = $1 AND "transactionType" = 'TUITION_BATES'`, [p.id]);
      stat.deleted++;
      for (const part of p.parts) {
        await tx.query(
          `INSERT INTO student_ledger ("studentId","termId","transactionType",amount,description,"referenceId","universityId")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            orig.studentId,
            orig.termId,
            part.type,
            part.amount,
            `${part.label} (TermAms id=${p.ref})`,
            p.ref,
            UNI,
          ],
        );
        stat.inserted++;
      }
    }
    await tx.query('COMMIT');
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }

  console.log(`deleted merged: ${stat.deleted} · inserted subtypes: ${stat.inserted}`);
  console.log('✓ مبلغ‌ها تغییری نکردند ⇒ ماندهٔ دانشجویان همان است.');
  await pool.end();
})().catch((e) => {
  console.error('FATAL', e);
  try { pool.end(); } catch {}
  process.exit(1);
});

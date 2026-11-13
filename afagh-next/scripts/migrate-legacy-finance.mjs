#!/usr/bin/env node
/**
 * مهاجرت مالی از سیستم قدیمی (ueams) به student_ledger / payment_* / financial_clearances
 *
 * منبع: فایل‌های TSV صادرشده توسط extract-legacy-finance.mjs (هر هفته تازه از UEMS)
 *   TermAms.tsv  → TUITION_FIXED (Fix_Price) + TUITION_VARIABLE (Units_Price)
 *   StdPays.tsv  → PAYMENT (نقدی/درگاه/چک حسب pay_type)
 *   + financial_clearances برای ترم‌های تسویه‌شده (FinallAcc = 0)
 *
 * قانون چنددانشگاهی: همهٔ مطابقت‌ها با (universityId + کد)؛ همهٔ insert ها
 * universityId صریح دارند. کد ترم قدیمی ('902') → کد ما ('13902').
 *
 *   node migrate-legacy-finance.mjs --dir <tsv> --uni 1                 (dry: فقط گیت)
 *   node migrate-legacy-finance.mjs --dir <tsv> --uni 1 --diff          (dry: گزارش تفاوتها)
 *   node migrate-legacy-finance.mjs --dir <tsv> --uni 1 --apply         (درج ایدمپاتنت)
 *   node migrate-legacy-finance.mjs --dir <tsv> --uni 1 --apply \
 *        --upsert --backup ./ledger-before-upsert.jsonl                  (درج + اصلاح مقادیر)
 *   node migrate-legacy-finance.mjs --dir <tsv> --uni 1 --apply --upsert \
 *        --repair-only --backup ./ledger-before-upsert.jsonl             (فقط اصلاح مقادیر)
 *   node migrate-legacy-finance.mjs --restore ./ledger-before-upsert.jsonl
 *
 * ── چرا --upsert لازم شد ───────────────────────────────────────────────────
 * مهاجرت قدیمی فقط INSERT ایدمپاتنت بود (dedupe روی referenceId+transactionType).
 * اگر مبلغ یا شرح یک فیش/سند شهریه در UEMS اصلاح میشد، ردیف قبلی student_ledger
 * همان مقدار کهنه را نگه میداشت و هفتگی «بروز» نمیشد. --upsert پیش از درجها،
 * تفاوتها را در یک پاس دستهای (unnest) پیدا میکند، از ردیفهایی که قرار است
 * تغییر کنند بکاپ JSONL میگیرد و سپس **فقط** amount و description را اصلاح
 * مینماید. ستونهای هویتی (studentId/termId/referenceId/transactionType/
 * universityId) و ستونهای مستندسازت (payerName/receiptNo/depositType/...)
 * هرگز دست نمییابند.
 *
 * ایمنی upsert:
 *   - --apply + --upsert بدون --backup رد میشود (بکاپ اجباری، قابل --restore).
 *   - referenceId NULL ⇒ قابل انطباق نیست ⇒ نادیده گرفته میشود و شمارش میگردد.
 *   - چند ردیف DB با یک (referenceId, transactionType) ⇒ fail-closed، رد میشود.
 *   - universityId متفاوت ⇒ رد میشود (دست به دادهٔ دانشگاه دیگر نمیزنیم).
 *   - UPDATE با id دقیق ردیف + ref + type + uni پین میشود و IS DISTINCT FROM
 *     دارد ⇒ اجرای مکرر بینه است.
 *   - گیت تطبیق ≥ --min-match (پیشفرض ۰٫۹) پیش از هر نوشتن اجرا میشود.
 *
 * --repair-only فقط فاز اصلاح مقادیر را اجرا میکند و حلقههای درج/تسویه را
 * رد میزند؛ برای تعمیر هدفمند بدون ۵ دقیقه SELECT بیهوده و بدون لمس
 * clearedAt تسویهحسابها. حتماً همراه --apply و --upsert میآید.
 *
 * Flags: --dir / --uni / --apply / --diff / --upsert / --repair-only / --backup / --restore
 *        --db-env <p> (یا متغیر محیط POSTGRES_PASSWORD) --db-host --db-port
 *        --min-match <0..1> --chunk <n>
 */
import { readFileSync, existsSync, writeFileSync, writeSync, openSync, closeSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── SQL های قابلتست (بدون اثر جانبی؛ tests/finance-upsert-contract.test.ts
//    آنها را روی PGlite اجرا میکند) ─────────────────────────────────────────
/** وضعیت فعلی هر (ref, type) در DB — صرفاً خواندنی. n>1 یعنی ابهام ⇒ رد شود. */
export const DIFF_SQL = `
SELECT s.ref, s.tt,
       count(l.id)::int       AS n,
       min(l.id)::int         AS id,
       min(l.amount)::text    AS amount,
       min(l.description)     AS description,
       min(l."universityId")::int AS uni
FROM unnest($1::int[], $2::text[]) AS s(ref, tt)
LEFT JOIN student_ledger l
  ON l."referenceId" = s.ref AND l."transactionType" = s.tt
GROUP BY s.ref, s.tt`;

/** بروزرسانی دستهای، پینشده روی id دقیق؛ فقط دو ستون مجاز تغییر میکنند. */
export const UPDATE_SQL = `
UPDATE student_ledger l
SET amount = s.amt, description = s.descr
FROM unnest($1::int[], $2::text[], $3::numeric[], $4::text[], $5::int[], $6::int[])
     AS s(id, tt, amt, descr, uni, ref)
WHERE l.id = s.id
  AND l."referenceId" = s.ref
  AND l."transactionType" = s.tt
  AND l."universityId" = s.uni
  AND (l.amount IS DISTINCT FROM s.amt OR l.description IS DISTINCT FROM s.descr)
RETURNING l.id`;

/** بکاپ دقیق ردیفهایی که قرار است تغییر کنند (قبل از UPDATE). */
export const BACKUP_SQL = `
SELECT id, "referenceId" AS ref, "transactionType" AS tt,
       amount::text AS amount, description, "universityId" AS uni, "depositType" AS "depositType"
FROM student_ledger
WHERE id = ANY($1::int[])`;

// ── آرگومانها ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
  }
  return a;
}

// ── کمکهای TSV (منطق دقیقاً همان نسخهٔ قبل، بدون تغییر رفتار درج) ──────────
const readTsv = (dir, name) => {
  const p = join(dir, name);
  if (!existsSync(p)) throw new Error('missing ' + p);
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map(l => l.split('\t'));
  return { header, rows };
};
const col = (row, header, ...names) => {
  for (const n of names) {
    let i = header.indexOf(n);
    if (i < 0) i = header.findIndex(h => h.toLowerCase() === n.toLowerCase());
    if (i >= 0 && i < row.length) return String(row[i] ?? '').trim();
  }
  return '';
};
const num = (s) => { const v = Number(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : null; };
/** کد ترم قدیمی ('902') → کد ما ('13902') */
const toOurTerm = (legacy) => {
  const s = String(legacy ?? '').trim();
  if (/^\d{3}$/.test(s)) return '13' + s;      // 902 → 13902
  if (/^\d{4}$/.test(s)) return '1' + s;       // 1390 → 11390 (پسمانده — outlier)
  if (/^\d{5}$/.test(s)) return s;             // 14051 / 13831 (فرمت کامل uems)
  return s;
};
/** referenceId int4 است؛ شناسهٔ قدیمی گاهی تا ~2.1 میلیارد میرود. */
const safeRef = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 && n <= 2000000000 ? n : null;
};
const cap = (a, n) => a.slice(0, n);

/** ساخت «ردیفهای موردانتظار» student_ledger از TSVها.
 *  هم درج و هم تشخیص تفاوتها از همین یک لیست تغذیه میشوند ⇒ واگرایی منطق صفر. */
export function buildExpected(dir, uni, stuById, termById) {
  const tams = readTsv(dir, 'TermAms.tsv');
  const spay = readTsv(dir, 'StdPays.tsv');
  const paytype = readTsv(dir, 'paytype.tsv');
  const paytypeByCode = new Map(paytype.rows.map(r => [String(r[0]).trim(), col(r, paytype.header, 'title') || '']));

  const expected = [];
  const clearances = [];
  const allStno = new Set();
  const allTermsRaw = new Set();
  const stats = {
    termAmsRows: tams.rows.length, stdPaysRows: spay.rows.length,
    feeSkipNoStudent: 0, feeSkipNoTerm: 0, feeSkipZero: 0,
    paySkipNoStudent: 0, paySkipNoTerm: 0, paySkipZero: 0,
    clearanceSkipNoStudent: 0, clearanceSkipNoTerm: 0,
    payTypeMissing: new Set(),
  };

  for (const r of tams.rows) {
    const stno = col(r, tams.header, 'StnO', 'Stno');
    const tcode = col(r, tams.header, 'TermCode');
    if (stno) allStno.add(stno);
    if (tcode) allTermsRaw.add(tcode);
    const sid = stuById.get(stno);
    const tid = termById.get(toOurTerm(tcode));
    const amsId = col(r, tams.header, 'TermAmsId');
    const ref = safeRef(amsId);
    if (num(col(r, tams.header, 'FinallAcc')) === 0) {
      if (!sid) stats.clearanceSkipNoStudent++;
      else if (!tid) stats.clearanceSkipNoTerm++;
      else clearances.push({ sid, tid });
    }
    if (!sid) { stats.feeSkipNoStudent++; continue; }
    if (!tid) { stats.feeSkipNoTerm++; continue; }
    for (const [tt, amt] of [
      ['TUITION_FIXED', num(col(r, tams.header, 'Fix_Price'))],
      ['TUITION_VARIABLE', num(col(r, tams.header, 'Units_Price'))],
    ]) {
      if (!amt) { stats.feeSkipZero++; continue; }
      expected.push({
        ref, tt, sid, tid, amount: amt, uni,
        description: `وارد از سیستم قدیمی (TermAms id=${amsId})`,
      });
    }
  }

  for (const r of spay.rows) {
    const stno = col(r, spay.header, 'Stno');
    const tcode = col(r, spay.header, 'TermCode');
    if (stno) allStno.add(stno);
    if (tcode) allTermsRaw.add(tcode);
    const sid = stuById.get(stno);
    const tid = termById.get(toOurTerm(tcode));
    const mab = num(col(r, spay.header, 'Mab'));
    if (!sid) { stats.paySkipNoStudent++; continue; }
    if (!tid) { stats.paySkipNoTerm++; continue; }
    if (!mab) { stats.paySkipZero++; continue; }
    const pt = col(r, spay.header, 'pay_type');
    const who = paytypeByCode.get(pt) || '';
    if (pt && !paytypeByCode.has(pt)) stats.payTypeMissing.add(pt);
    expected.push({
      ref: safeRef(col(r, spay.header, 'stdpaysId')), tt: 'PAYMENT', sid, tid, amount: mab, uni,
      description: `پرداخت از سیستم قدیمی — فیش ${col(r, spay.header, 'Fish_no')}${who ? ' (' + who + ')' : ''}`,
    });
  }

  return { expected, clearances, stats, allStno: [...allStno], derive: [...new Set([...allTermsRaw].map(toOurTerm))], paytypeByCode };
}

/** مقایسهٔ دستهای «انتظار TSV» با «واقعیت DB» — بدون هیچ نوشتهای. */
export async function computeDiff(q, expected, uni, chunk = 5000) {
  const uniq = new Map();
  let nullRef = 0, duplicateSourceKeys = 0;
  for (const r of expected) {
    if (r.ref === null) { nullRef++; continue; }
    const k = r.tt + ':' + r.ref;
    if (uniq.has(k)) { duplicateSourceKeys++; continue; }
    uniq.set(k, r);
  }
  const items = [...uniq.values()];
  const out = {
    expected: items.length, nullRef, duplicateSourceKeys,
    matched: 0, missing: 0, duplicateRefs: 0, foreignUni: 0,
    amountDiff: 0, descriptionDiff: 0, bothDiff: 0, unchanged: 0,
    sample: [], toUpdate: [],
  };
  for (let i = 0; i < items.length; i += chunk) {
    const part = items.slice(i, i + chunk);
    const dbRows = await q(DIFF_SQL, [part.map(r => r.ref), part.map(r => r.tt)]);
    const byKey = new Map(dbRows.map(d => [d.tt + ':' + d.ref, d]));
    for (const r of part) {
      const d = byKey.get(r.tt + ':' + r.ref);
      if (!d || Number(d.n) === 0) { out.missing++; continue; }
      if (Number(d.n) > 1) { out.duplicateRefs++; continue; }
      if (Number(d.uni) !== uni) { out.foreignUni++; continue; }
      out.matched++;
      const amtDiff = Number(d.amount) !== r.amount;
      const descDiff = String(d.description ?? '') !== r.description;
      if (!amtDiff && !descDiff) { out.unchanged++; continue; }
      if (amtDiff && descDiff) out.bothDiff++;
      else if (amtDiff) out.amountDiff++;
      else out.descriptionDiff++;
      const rec = {
        id: Number(d.id), ref: r.ref, tt: r.tt, uni,
        amount: r.amount, description: r.description,
        oldAmount: String(d.amount), oldDescription: String(d.description ?? ''),
      };
      out.toUpdate.push(rec);
      if (out.sample.length < 10) out.sample.push({ ref: rec.ref, tt: rec.tt, ...rec });
    }
  }
  return out;
}

// ── اتصال (فقط داخل main ساخته میشود ⇒ import توسط تست بیدردسر است) ────────
let pool = null;
const q = async (t, p) => (await pool.query(t, p)).rows;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const APPLY = args.apply === 'true';
  const DIFF = args.diff === 'true';
  const UPSERT = args.upsert === 'true';
  const REPAIR_ONLY = args['repair-only'] === 'true';
  const BACKUP = args.backup && args.backup !== 'true' ? args.backup : '';
  const RESTORE = args.restore && args.restore !== 'true' ? args.restore : '';
  const UNI = Number(args.uni || 1);
  const MIN_MATCH = Number(args['min-match'] || 0.9);
  const DIR = args.dir || '/tmp/lp2v2/fin_export_uems';
  const DB_ENV = args['db-env'] || '';
  const DB_HOST = args['db-host'] || '172.20.0.3';
  const DB_PORT = Number(args['db-port'] || 5432);
  const CHUNK = Number(args.chunk || 5000);

  let password = String(process.env.POSTGRES_PASSWORD || '').trim();
  if (!password && DB_ENV) {
    if (!existsSync(DB_ENV)) throw new Error('db-env not found: ' + DB_ENV);
    const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
    if (!m) throw new Error('POSTGRES_PASSWORD not found in ' + DB_ENV);
    password = m[1].replace(/\r$/, '');
  }
  if (!password) throw new Error('رمز Postgres مقصد مشخص نشد (POSTGRES_PASSWORD یا --db-env)');
  const req = createRequire(import.meta.url);
  const { Pool } = req('pg');
  pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password, database: 'afagh_db', max: 5 });

  try {
    // ── حالت بازگردانی: فقط ردیفهای بکاپشده، با id دقیق ──────────────────
    if (RESTORE) {
      if (!existsSync(RESTORE)) throw new Error('backup file not found: ' + RESTORE);
      const recs = readFileSync(RESTORE, 'utf8').split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
      let restored = 0;
      for (let i = 0; i < recs.length; i += 1000) {
        const p = recs.slice(i, i + 1000);
        restored += (await q(UPDATE_SQL, [
          p.map(r => r.id), p.map(r => r.tt), p.map(r => Number(r.amount)),
          p.map(r => r.description ?? ''), p.map(r => r.uni), p.map(r => r.ref),
        ])).length;
      }
      console.log(`RESTORE: ${restored}/${recs.length} ردیف از ${RESTORE} بازگردانده شد`);
      await pool.end();
      return;
    }

    const uni = (await q('SELECT id, code, title FROM universities WHERE id=$1', [UNI]))[0];
    if (!uni) throw new Error('university not found: ' + UNI);
    console.log('university:', uni.code, uni.title, 'apply=', APPLY, 'upsert=', UPSERT, 'diff=', DIFF);

    // ایندکس dedupe (بدون آن، هر ردیف اسکن کامل جدول است)
    await q(`CREATE INDEX IF NOT EXISTS idx_student_ledger_ref_type ON student_ledger ("referenceId", "transactionType")`);
    console.log('index: idx_student_ledger_ref_type ensured');

    const students = await q('SELECT id, "studentCode" FROM students WHERE "universityId"=$1', [UNI]);
    const stuById = new Map(students.map(r => [String(r.studentCode), Number(r.id)]));
    const terms = await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]);
    const termById = new Map(terms.map(r => [String(r.termCode), Number(r.id)]));
    console.log('maps (uni ' + UNI + '): students=' + students.length + ' terms=' + terms.length);

    const fin = buildExpected(DIR, UNI, stuById, termById);
    const expected = fin.expected;
    console.log('tsv: termAms=' + fin.stats.termAmsRows + ' stdPays=' + fin.stats.stdPaysRows + ' expected=' + expected.length);

    // ── گیت: نرخ تطبیق ──────────────────────────────────────────────────
    const stHit = fin.allStno.filter(c => stuById.has(c));
    const tHit = fin.derive.filter(c => termById.has(c));
    const gate = {
      stnoTotal: fin.allStno.length, stnoMatched: stHit.length,
      stnoRate: fin.allStno.length ? stHit.length / fin.allStno.length : 0,
      stnoMissingSample: cap(fin.allStno.filter(c => !stuById.has(c)), 10),
      termsTotal: fin.derive.length, termsMatched: tHit.length,
      termsRate: fin.derive.length ? tHit.length / fin.derive.length : 0,
      termsMissingSample: cap(fin.derive.filter(c => !termById.has(c)), 10),
      minMatch: MIN_MATCH,
    };
    console.log(`GATE stno: ${gate.stnoMatched}/${gate.stnoTotal} = ${(100 * gate.stnoRate).toFixed(2)}%`);
    console.log(`GATE terms: ${gate.termsMatched}/${gate.termsTotal} = ${(100 * gate.termsRate).toFixed(2)}%`);
    gate.pass = gate.stnoRate >= MIN_MATCH && gate.termsRate >= MIN_MATCH;
    if (!gate.pass) throw new Error('GATE under ' + MIN_MATCH + ' — refuse (dry or apply)');

    if (UPSERT && APPLY && !BACKUP) {
      throw new Error('--upsert --apply نیازمند --backup <file.jsonl> است (بکاپ قابل بازگردانی اجباری است)');
    }
    if (REPAIR_ONLY && (!APPLY || !UPSERT)) {
      throw new Error('--repair-only فقط همراه --apply --upsert معنا دارد');
    }

    // ── تشخیص تفاوتها (فقطخواندنی) ──────────────────────────────────────
    let diff = null;
    if (DIFF || (UPSERT && APPLY)) {
      diff = await computeDiff(q, expected, UNI, CHUNK);
      console.log('\n── گزارش تطبیق مالی (TSV تازه ↔ student_ledger) ──');
      console.log(`  ردیفهای قابلانطباق: ${diff.expected}`);
      console.log(`  منطبق: ${diff.matched}  بدونتغییر: ${diff.unchanged}`);
      console.log(`  تفاوت مبلغ: ${diff.amountDiff}  تفاوت شرح: ${diff.descriptionDiff}  هر دو: ${diff.bothDiff}`);
      console.log(`  مفقود (توسط درج اضافه میشوند): ${diff.missing}`);
      console.log(`  ref تکراری در DB: ${diff.duplicateRefs}  دانشگاه دیگر: ${diff.foreignUni}  ref NULL: ${diff.nullRef}  کلید تکراری منبع: ${diff.duplicateSourceKeys}`);
      const changed = diff.amountDiff + diff.descriptionDiff + diff.bothDiff;
      console.log(`  ⇒ جمع تغییرات قابلاعمال: ${changed}`);
      for (const s of diff.sample) {
        console.log(`    • ${s.tt}/${s.ref}: ${s.oldAmount} → ${s.amount} | ${JSON.stringify(s.oldDescription)} → ${JSON.stringify(s.description)}`);
      }
    }

    if (!APPLY) {
      console.log('*** DRY: گزارش، بدون نوشتن ***');
      await pool.end();
      return;
    }

    // ── بکاپ + اعمال بروزرسانیها ─────────────────────────────────────────
    if (UPSERT && diff && diff.toUpdate.length) {
      const ids = diff.toUpdate.map(r => r.id);
      const fd = openSync(BACKUP, 'w');
      try {
        for (let i = 0; i < ids.length; i += 1000) {
          const rows = await q(BACKUP_SQL, [ids.slice(i, i + 1000)]);
          for (const r of rows) writeSync(fd, JSON.stringify(r) + '\n', 'utf8');
        }
      } finally { closeSync(fd); }
      const size = statSync(BACKUP).size;
      if (!size) throw new Error('بکاپ خالی است؛ از اعمال صرفنظر شد: ' + BACKUP);
      console.log(`backup: ${ids.length} ردیف → ${BACKUP} (${size} bytes)`);

      let updated = 0;
      for (let i = 0; i < diff.toUpdate.length; i += 1000) {
        const p = diff.toUpdate.slice(i, i + 1000);
        updated += (await q(UPDATE_SQL, [
          p.map(r => r.id), p.map(r => r.tt), p.map(r => r.amount),
          p.map(r => r.description), p.map(r => r.uni), p.map(r => r.ref),
        ])).length;
      }
      console.log(`upsert: ${updated}/${diff.toUpdate.length} ردیف بروز شد`);
    } else if (UPSERT) {
      console.log('upsert: تفاوتی یافت نشد (نوشتن انجام نشد)');
      // بکاپ خالی هم بنویسیم تا مسیر قابل ردیابی باشد
      writeFileSync(BACKUP, '', 'utf8');
    }

    if (REPAIR_ONLY) {
      console.log('\n*** REPAIR DONE — درج/تسویهحساب رد شد (فقط اصلاح مقادیر) ***');
      await pool.end();
      return;
    }

    // ═══════════════ A. TermAms → student_ledger ═══════════════
    console.log('\n── TermAms → ledger ──');
    const aStat = { rows: fin.stats.termAmsRows, feeFixed: 0, feeUnits: 0, skipNoStudent: fin.stats.feeSkipNoStudent, skipNoTerm: fin.stats.feeSkipNoTerm, skipZero: fin.stats.feeSkipZero };
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      let batch = 0;
      for (const r of expected.filter(x => x.tt !== 'PAYMENT')) {
        if (r.ref !== null) {
          const ex = await tx.query(`SELECT 1 FROM student_ledger WHERE "referenceId"=$1 AND "transactionType"=$2 LIMIT 1`, [r.ref, r.tt]);
          if (ex.rows.length) continue;
        }
        await tx.query(
          `INSERT INTO student_ledger ("studentId","termId","transactionType",amount,description,"referenceId","universityId")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r.sid, r.tid, r.tt, r.amount, r.description, r.ref, UNI],
        );
        if (r.tt === 'TUITION_FIXED') aStat.feeFixed++; else aStat.feeUnits++;
        if (++batch % 5000 === 0) {
          await tx.query('COMMIT'); await tx.query('BEGIN');
          console.log(`  ... TermAms progress: fixed=${aStat.feeFixed} units=${aStat.feeUnits}`);
        }
      }
      await tx.query('COMMIT');
    } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
    console.log(`fees: fixed=${aStat.feeFixed} units=${aStat.feeUnits} skipNoStudent=${aStat.skipNoStudent} skipNoTerm=${aStat.skipNoTerm} skipZero=${aStat.skipZero}`);

    // ═══════════════ B. StdPays → student_ledger PAYMENT ═══════════════
    console.log('\n── StdPays → ledger PAYMENT ──');
    const pStat = { rows: fin.stats.stdPaysRows, inserted: 0, skipNoStudent: fin.stats.paySkipNoStudent, skipNoTerm: fin.stats.paySkipNoTerm, skipZero: fin.stats.paySkipZero, payTypeMissing: [...fin.stats.payTypeMissing] };
    const tx2 = await pool.connect();
    try {
      await tx2.query('BEGIN');
      for (const r of expected.filter(x => x.tt === 'PAYMENT')) {
        if (r.ref !== null) {
          const ex = await tx2.query(`SELECT 1 FROM student_ledger WHERE "referenceId"=$1 AND "transactionType"='PAYMENT' LIMIT 1`, [r.ref]);
          if (ex.rows.length) continue;
        }
        await tx2.query(
          `INSERT INTO student_ledger ("studentId","termId","transactionType",amount,description,"referenceId","universityId")
           VALUES ($1,$2,'PAYMENT',$3,$4,$5,$6)`,
          [r.sid, r.tid, r.amount, r.description, r.ref, UNI],
        );
        pStat.inserted++;
        if (pStat.inserted % 5000 === 0) {
          await tx2.query('COMMIT'); await tx2.query('BEGIN');
          console.log(`  ... StdPays progress: inserted=${pStat.inserted}`);
        }
      }
      await tx2.query('COMMIT');
    } catch (e) { await tx2.query('ROLLBACK'); throw e; } finally { tx2.release(); }
    console.log(`payments: inserted=${pStat.inserted} skipNoStudent=${pStat.skipNoStudent} skipNoTerm=${pStat.skipNoTerm} skipZero=${pStat.skipZero}`);

    // ═══════════════ C. financial_clearances (FinallAcc = 0) ═══════════════
    console.log('\n── clearances (FinallAcc=0) ──');
    const cStat = { candidates: fin.clearances.length, inserted: 0, skipNoStudent: fin.stats.clearanceSkipNoStudent, skipNoTerm: fin.stats.clearanceSkipNoTerm };
    const tx3 = await pool.connect();
    try {
      await tx3.query('BEGIN');
      for (const c of fin.clearances) {
        await tx3.query(
          `INSERT INTO financial_clearances ("studentId","termId","isCleared","clearedAt","universityId")
           VALUES ($1,$2,1,NOW(),$3) ON CONFLICT ("studentId","termId") DO UPDATE SET "isCleared"=1,"clearedAt"=NOW()`,
          [c.sid, c.tid, UNI],
        );
        cStat.inserted++;
        if (cStat.inserted % 5000 === 0) {
          await tx3.query('COMMIT'); await tx3.query('BEGIN');
          console.log(`  ... clearances progress: inserted=${cStat.inserted}`);
        }
      }
      await tx3.query('COMMIT');
    } catch (e) { await tx3.query('ROLLBACK'); throw e; } finally { tx3.release(); }
    console.log(`clearances: inserted=${cStat.inserted}`);

    console.log('\n*** APPLY DONE ***');
    await pool.end();
  } catch (e) {
    console.error('FATAL', e);
    try { await pool.end(); } catch {}
    process.exit(1);
  }
}

// اجرا فقط وقتی مستقیماً فراخوانی شود ⇒ import توسط تست اثر جانبی ندارد
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

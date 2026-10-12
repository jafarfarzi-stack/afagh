#!/usr/bin/env node
/**
 * تطبیق ریال‌به‌ریال فریز مالی:
 * به ازای هر (دانشجو، ترّم) → تراز لجر ما (شهریه ثابت+متغیر − پرداخت)
 * با تراز قدیمی (TermAcc / رابطهٔ قدیمی) مقایسه می‌شود.
 * قاعدهٔ قدیمی: TermAcc = TermPays − (Fix_Price + Units_Price + Fix_Bates
 *   + Units_Bates + Mab_Bates) + (TMabIncDec + TFix_PriceIncDec + TUnits_PriceIncDec
 *   + TSUMMab_Subject + TMab_Support)
 * وقتی bates/incdec ها صفر باشند: تراز ما باید = −TermAcc (چون پرداخت ما = TermPays).
 *
 * روش اجرا (روی سرور، مثل migrate):
 *   node verify-legacy-rial.mjs --dir /tmp/lp2v2/fin_export_uems --uni 1 --db-host <ip>
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) { if (raw[i].startsWith('--')) { const k = raw[i].slice(2); args[k] = (raw[i+1] && !raw[i+1].startsWith('--')) ? raw[++i] : 'true'; } }
const UNI = Number(args.uni || 1);
const DIR = args.dir || '/tmp/lp2v2/fin_export_uems';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.3';

const req = createRequire(resolve(DIR, '..', 'package.json'));
const { Pool } = req('pg');
const envTxt = readFileSync(DB_ENV, 'utf8');
const m = envTxt.match(/^POSTGRES_PASSWORD=(.*)$/m);
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });
const q = async (t, p) => (await pool.query(t, p)).rows;

const readTsv = (name) => {
  const p = join(DIR, name);
  if (!existsSync(p)) throw new Error('missing ' + p);
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0].split('\t');
  return { header, rows: lines.slice(1).map(l => l.split('\t')) };
};
const col = (row, header, n) => { const i = header.indexOf(n); return i>=0 && i<row.length ? String(row[i] ?? '').trim() : ''; };
const num = (s) => { const v = Number(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : 0; };
const toOurTerm = (legacy) => { const s=String(legacy??'').trim(); if(/^\d{3}$/.test(s)) return '13'+s; if(/^\d{4}$/.test(s)) return '1'+s; return s; };

(async () => {
  const students = await q('SELECT id, "studentCode" FROM students WHERE "universityId"=$1', [UNI]);
  const stuById = new Map(students.map(r => [String(r.studentCode), Number(r.id)]));
  const terms = await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]);
  const termById = new Map(terms.map(r => [String(r.termCode), Number(r.id)]));

  const tams = readTsv('TermAms.tsv');
  const spay = readTsv('StdPays.tsv');

  // پرداخت قدیمی به ازای (student+term) — جمع Mab
  const legacyPay = new Map(); // 'sid|tid' -> sum
  for (const r of spay.rows) {
    const sid = stuById.get(col(r, spay.header, 'Stno'));
    const tid = termById.get(toOurTerm(col(r, spay.header, 'TermCode')));
    if (!sid || !tid) continue;
    const k = `${sid}|${tid}`;
    legacyPay.set(k, (legacyPay.get(k) || 0) + num(col(r, spay.header, 'Mab')));
  }

  // تراز لجر ما به ازای (sid|tid)
  const led = await q(`
    SELECT sl."studentId", sl."termId",
      SUM(CASE WHEN sl."transactionType" IN ('TUITION_FIXED','TUITION_VARIABLE','TUITION_BATES') THEN sl.amount ELSE 0 END) AS fees,
      SUM(CASE WHEN sl."transactionType" = 'PAYMENT' THEN sl.amount ELSE 0 END) AS pays
    FROM student_ledger sl WHERE sl."universityId"=$1 GROUP BY 1,2`, [UNI]);
  const ourNet = new Map(led.map(r => [`${r.studentId}|${r.termId}`, { fees: num(r.fees), pays: num(r.pays) }]));

  let exact = 0, diff = 0, onlyOur = 0, onlyLegacy = 0, sumDiff = 0;
  const samples = [];
  for (const r of tams.rows) {
    const sid = stuById.get(col(r, tams.header, 'Stno'));
    const tid = termById.get(toOurTerm(col(r, tams.header, 'TermCode')));
    if (!sid || !tid) continue;
    const k = `${sid}|${tid}`;
    const fix = num(col(r, tams.header, 'Fix_Price'));
    const units = num(col(r, tams.header, 'Units_Price'));
    const bates = num(col(r, tams.header, 'Fix_Bates')) + num(col(r, tams.header, 'Units_Bates')) + num(col(r, tams.header, 'Mab_Bates'));
    const adjust = num(col(r, tams.header, 'TMabIncDec')) + num(col(r, tams.header, 'TFix_PriceIncDec')) + num(col(r, tams.header, 'TUnits_PriceIncDec')) + num(col(r, tams.header, 'TSUMMab_Subject')) + num(col(r, tams.header, 'TMab_Support'));
    const termAcc = num(col(r, tams.header, 'TermAcc'));
    const legacyPaySum = legacyPay.get(k) ?? 0;
    // تراز موردانتظار قدیمی: TermAcc = TermPays − (fix+units) − bates + adjust → از سمت ما:
    //   expectedOur = (fix+units) + bates − legacyPaySum (− adjust در صورت اعمال انطباق)
    const expectedOur = (fix + units + bates) - legacyPaySum;
    const o = ourNet.get(k);
    if (!o) { onlyLegacy++; continue; }
    const our = o.fees - o.pays;
    if (our === expectedOur && adjust === 0) { exact++; }
    else {
      diff++;
      const delta = our - expectedOur;
      sumDiff += Math.abs(delta);
      if (samples.length < 25) samples.push({ k, fix, units, bates, adjust, termAcc, legacyPaySum, our, expectedOur, delta });
    }
  }
  // ردیف‌هایی که در لجر ما هست ولی از TermAms نیامده (ندارد) — جزئی گزارش
  // (با Set؛ نسخهٔ قبلی به‌ازای هر کلید کل TermAms را می‌گشت — O(n²) و ساعت‌ها CPU)
  const amsKeys = new Set();
  for (const r of tams.rows) {
    const sid = stuById.get(col(r, tams.header, 'Stno'));
    const tid = termById.get(toOurTerm(col(r, tams.header, 'TermCode')));
    if (sid && tid) amsKeys.add(`${sid}|${tid}`);
  }
  for (const k of ourNet.keys()) {
    if (!amsKeys.has(k)) onlyOur++;
  }

  console.log(`== RIALL CHECK (uni ${UNI}) ==`);
  console.log(`termAms rows: ${tams.rows.length}`);
  console.log(`exact (adjust=0): ${exact}`);
  console.log(`diff: ${diff}`);
  console.log(`only-in-our-ledger(no legacy ams): ${onlyOur}`);
  console.log(`legacy rows w/o our ledger: ${onlyLegacy}`);
  console.log(`sum |delta| (rial): ${sumDiff.toLocaleString('en')}`);
  console.log('samples:');
  for (const s of samples) {
    console.log(`  k=${s.k} fix=${s.fix} units=${s.units} bates=${s.bates} adjust=${s.adjust} legacyPay=${s.legacyPaySum} our=${s.our} expected=${s.expectedOur} delta=${s.delta}`);
  }
  await pool.end();
})().catch(e => { console.error('FATAL', e); try { pool.end(); } catch {} process.exit(1); });
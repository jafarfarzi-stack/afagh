#!/usr/bin/env node
/**
 * مهاجرت مالی از سیستم قدیمی (ueams) به student_ledger / payment_* / financial_clearances
 *
 * منبع: فایل‌های TSV صادرشده از موتور SQL محلی (D:\farzi\git\backup\fin_export)
 *   TermAms.tsv  → TUITION_FIXED (Fix_Price) + TUITION_VARIABLE (Units_Price)
 *   StdPays.tsv  → PAYMENT (نقدی/درگاه/چک حسب pay_type)
 *   + financial_clearances برای ترم‌های تسویه‌شده (FinallAcc = 0)
 *
 * قانون چنددانشگاهی: همهٔ مطابقت‌ها با (universityId + کد)؛ همهٔ insert ها
 * universityId صریح دارند. کد ترم قدیمی ('902') → کد ما ('13902').
 *
 *   node migrate-legacy-finance.mjs --dir <tsv-base> --uni 1   (dry: فقط گزارش)
 *   node migrate-legacy-finance.mjs --dir <tsv-base> --uni 1 --apply
 *   Flags: --db-env /root/afagh/.env --db-host <ip> --uni 1 --min-match 0.9
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) { const k = raw[i].slice(2); args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true'; }
}
const APPLY = args.apply === 'true';
const UNI = Number(args.uni || 1);
const MIN_MATCH = Number(args['min-match'] || 0.9);
const DIR = args.dir || '/tmp/lp2v2/fin_export_uems';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.3';

const req = createRequire(resolve(DIR, '..', 'package.json'));
const { Pool } = req('pg');
const envTxt = readFileSync(DB_ENV, 'utf8');
const m = envTxt.match(/^POSTGRES_PASSWORD=(.*)$/m);
if (!m) { console.error('POSTGRES_PASSWORD not found in ' + DB_ENV); process.exit(2); }
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });
const q = async (t, p) => (await pool.query(t, p)).rows;

const readTsv = (name) => {
  const p = join(DIR, name);
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
const cap = (a, n) => a.slice(0, n);
const report = { dry: !APPLY, uni: UNI, gate: null, termAms: null, stdPays: null, clearances: null, errors: [] };

(async () => {
  try {
    const uni = (await q('SELECT id, code, title FROM universities WHERE id=$1', [UNI]))[0];
    if (!uni) throw new Error('university not found: ' + UNI);
    console.log('university:', uni.code, uni.title, 'apply=', APPLY);

    // ── نقشه‌های (uni + کد) ──
    const students = (await q('SELECT id, "studentCode" FROM students WHERE "universityId"=$1', [UNI]));
    const stuById = new Map(students.map(r => [String(r.studentCode), Number(r.id)]));
    const terms = (await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]));
    const termById = new Map(terms.map(r => [String(r.termCode), Number(r.id)]));
    console.log('maps (uni ' + UNI + '): students=' + students.length + ' terms=' + terms.length);

    const tams = readTsv('TermAms.tsv');
    const spay = readTsv('StdPays.tsv');
    const paytype = readTsv('paytype.tsv');
    const paytypeByCode = new Map(paytype.rows.map(r => [String(r[0]).trim(), col(r, paytype.header, 'title') || '']));
    console.log('tsv: termAms=' + tams.rows.length + ' stdPays=' + spay.rows.length);

    // ── گیت: نرخ تطبیق ──
    const amsStno = new Set(tams.rows.map(r => col(r, tams.header, 'StnO', 'Stno')).filter(Boolean));
    const payStno = new Set(spay.rows.map(r => col(r, spay.header, 'Stno')).filter(Boolean));
    const allStno = [...new Set([...amsStno, ...payStno])];
    const stHit = allStno.filter(c => stuById.has(c));
    const allTermsRaw = new Set([...tams.rows.map(r => col(r, tams.header, 'TermCode')), ...spay.rows.map(r => col(r, spay.header, 'TermCode'))].filter(Boolean));
    const derive = [...new Set([...allTermsRaw].map(toOurTerm))];
    const tHit = derive.filter(c => termById.has(c));
    report.gate = {
      stnoTotal: allStno.length, stnoMatched: stHit.length, stnoRate: stHit.length / allStno.length,
      stnoMissingSample: cap(allStno.filter(c => !stuById.has(c)), 10),
      termsTotal: derive.length, termsMatched: tHit.length, termsRate: tHit.length / derive.length,
      termsMissingSample: cap(derive.filter(c => !termById.has(c)), 10),
      minMatch: MIN_MATCH,
    };
    console.log(`GATE stno: ${stHit.length}/${allStno.length} = ${(100 * report.gate.stnoRate).toFixed(2)}%`);
    console.log(`GATE terms: ${tHit.length}/${derive.length} = ${(100 * report.gate.termsRate).toFixed(2)}%`);
    const gateOk = report.gate.stnoRate >= MIN_MATCH && report.gate.termsRate >= MIN_MATCH;
    report.gate.pass = gateOk;
    if (!gateOk) throw new Error('GATE under ' + MIN_MATCH + ' — refuse (dry or apply)');
    if (!APPLY) {
      console.log('*** DRY: گزارش، بدون نوشتن ***');
      await pool.end();
      return;
    }

    // ═══════════════ A. TermAms → student_ledger (TUITION_FIXED + TUITION_VARIABLE) ═══════════════
    console.log('\n── TermAms → ledger ──');
    const aStat = { rows: tams.rows.length, feeFixed: 0, feeUnits: 0, skipNoStudent: 0, skipNoTerm: 0, skipZero: 0 };
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      for (const r of tams.rows) {
        const stno = col(r, tams.header, 'StnO', 'Stno');
        const sid = stuById.get(stno);
        const tid = termById.get(toOurTerm(col(r, tams.header, 'TermCode')));
        const fix = num(col(r, tams.header, 'Fix_Price'));
        const units = num(col(r, tams.header, 'Units_Price'));
        const amsId = col(r, tams.header, 'TermAmsId');
        if (!sid) { aStat.skipNoStudent++; continue; }
        if (!tid) { aStat.skipNoTerm++; continue; }
        for (const [tt, amt] of [['TUITION_FIXED', fix], ['TUITION_VARIABLE', units]]) {
          if (!amt) { aStat.skipZero++; continue; }
          // referenceId int4 است؛ شناسهٔ قدیمی گاهی تا ~2.1 میلیارد می‌رود —
          // بدون offset (dedupe با transactionType) و محدود به بازهٔ امن.
          const ref = Number(amsId);
          const refSafe = Number.isSafeInteger(ref) && ref >= 0 && ref <= 2000000000 ? ref : null;
          if (refSafe !== null) {
            const ex = await tx.query(`SELECT 1 FROM student_ledger WHERE "referenceId"=$1 AND "transactionType"=$2 LIMIT 1`, [refSafe, tt]);
            if (ex.rows.length) continue;
          }
          await tx.query(
            `INSERT INTO student_ledger ("studentId","termId","transactionType",amount,description,"referenceId","universityId")
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [sid, tid, tt, amt, `وارد از سیستم قدیمی (TermAms id=${amsId})`, refSafe, UNI],
          );
          if (tt === 'TUITION_FIXED') aStat.feeFixed++; else aStat.feeUnits++;
        }
      }
      await tx.query('COMMIT');
    } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
    report.termAms = aStat;
    console.log(`fees: fixed=${aStat.feeFixed} units=${aStat.feeUnits} skipNoStudent=${aStat.skipNoStudent} skipNoTerm=${aStat.skipNoTerm} skipZero=${aStat.skipZero}`);

    // ═══════════════ B. StdPays → student_ledger PAYMENT ═══════════════
    console.log('\n── StdPays → ledger PAYMENT ──');
    const pStat = { rows: spay.rows.length, inserted: 0, skipNoStudent: 0, skipNoTerm: 0, skipZero: 0, payTypeMissing: new Set() };
    const tx2 = await pool.connect();
    try {
      await tx2.query('BEGIN');
      for (const r of spay.rows) {
        const sid = stuById.get(col(r, spay.header, 'Stno'));
        const tid = termById.get(toOurTerm(col(r, spay.header, 'TermCode')));
        const mab = num(col(r, spay.header, 'Mab'));
        if (!sid) { pStat.skipNoStudent++; continue; }
        if (!tid) { pStat.skipNoTerm++; continue; }
        if (!mab) { pStat.skipZero++; continue; }
        const pt = col(r, spay.header, 'pay_type');
        const spId = Number(col(r, spay.header, 'stdpaysId'));
        const ref = Number.isSafeInteger(spId) && spId >= 0 && spId <= 2000000000 ? spId : null;
        if (ref !== null) {
          const ex = await tx2.query(`SELECT 1 FROM student_ledger WHERE "referenceId"=$1 AND "transactionType"='PAYMENT' LIMIT 1`, [ref]);
          if (ex.rows.length) continue;
        }
        const who = paytypeByCode.get(pt) || '';
        if (pt && !paytypeByCode.has(pt)) pStat.payTypeMissing.add(pt);
        await tx2.query(
          `INSERT INTO student_ledger ("studentId","termId","transactionType",amount,description,"referenceId","universityId")
           VALUES ($1,$2,'PAYMENT',$3,$4,$5,$6)`,
          [sid, tid, mab, `پرداخت از سیستم قدیمی — فیش ${col(r, spay.header, 'Fish_no')}${who ? ' (' + who + ')' : ''}`, ref, UNI],
        );
        pStat.inserted++;
      }
      await tx2.query('COMMIT');
    } catch (e) { await tx2.query('ROLLBACK'); throw e; } finally { tx2.release(); }
    pStat.payTypeMissing = [...pStat.payTypeMissing];
    report.stdPays = pStat;
    console.log(`payments: inserted=${pStat.inserted} skipNoStudent=${pStat.skipNoStudent} skipNoTerm=${pStat.skipNoTerm} skipZero=${pStat.skipZero}`);

    // ═══════════════ C. financial_clearances (FinallAcc = 0) ═══════════════
    console.log('\n── clearances (FinallAcc=0) ──');
    const cStat = { candidates: 0, inserted: 0, skipNoStudent: 0, skipNoTerm: 0 };
    const tx3 = await pool.connect();
    try {
      await tx3.query('BEGIN');
      for (const r of tams.rows) {
        const fin = num(col(r, tams.header, 'FinallAcc'));
        if (fin !== 0) continue;
        const sid = stuById.get(col(r, tams.header, 'StnO', 'Stno'));
        const tid = termById.get(toOurTerm(col(r, tams.header, 'TermCode')));
        if (!sid) { cStat.skipNoStudent++; continue; }
        if (!tid) { cStat.skipNoTerm++; continue; }
        cStat.candidates++;
        await tx3.query(
          `INSERT INTO financial_clearances ("studentId","termId","isCleared","clearedAt","universityId")
           VALUES ($1,$2,1,NOW(),$3) ON CONFLICT ("studentId","termId") DO UPDATE SET "isCleared"=1,"clearedAt"=NOW()`,
          [sid, tid, UNI],
        );
        cStat.inserted++;
      }
      await tx3.query('COMMIT');
    } catch (e) { await tx3.query('ROLLBACK'); throw e; } finally { tx3.release(); }
    report.clearances = cStat;
    console.log(`clearances: inserted=${cStat.inserted} skipNoStudent=${cStat.skipNoStudent} skipNoTerm=${cStat.skipNoTerm}`);

    console.log('\n*** APPLY DONE ***');
    await pool.end();
  } catch (e) {
    console.error('FATAL', e);
    try { await pool.end(); } catch {}
    process.exit(1);
  }
})();
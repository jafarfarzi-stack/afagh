#!/usr/bin/env node
/**
 * درج «تعدیل» قدیمی در دفتر مالی — انواع TUITION_ADJUST_DEC و TUITION_ADJUST_INC
 *
 * تحلیل فرمول سیستم قدیمی (روی ۹۵٬۱۵۷ ردیف TermAms، دقت ۹۹٫۹۷٪):
 *   TermAcc = TermPays − (Fix_Price + Units_Price) + Bates + TSUMMab_Subject
 * که در آن Bates = Fix_Bates+Units_Bates+Mab_Bates (تخفیف/اعتبار) است.
 *   • TSUMMab_Subject < 0 → تعدیل کاهشی/تخفیف → TUITION_ADJUST_DEC (اعتبار)
 *   • TSUMMab_Subject > 0 → تعدیل افزایشی/بدهی → TUITION_ADJUST_INC (بدهی)
 * مبلغ در هر دو حالت به صورت قدر مطلق (|adjust| > 0) ذخیره می‌شود.
 *
 * نکته: ستون‌های TMabIncDec / TFix_PriceIncDec / TUnits_PriceIncDec / TMab_Support
 * در محاسبهٔ TermAcc قدیمی وارد نمی‌شوند (۹۹٫۲۱٪ TMabIncDec صرفاً کپیِ
 * TSUMMab_Subject است) — پس فقط TSUMMab_Subject درج می‌شود.
 *
 * idempotent: dedupe با (referenceId = TermAmsId, transactionType) — دقیقاً
 * همان الگوی insert-tuition-bates.mjs. اجرای تکراری چیزی اضافه نمی‌کند.
 *
 * اجرا (روی سرور، مثل verify):
 *   node insert-tuition-adjust.mjs --dir /tmp/lp2v2/fin_export_uems --uni 1 \
 *     --db-host <ip>            # بدون --dry → درج واقعی
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
const DRY = 'dry' in args;

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
const col = (row, header, ...names) => {
  for (const n of names) { const i = header.indexOf(n); if (i >= 0 && i < row.length) return String(row[i] ?? '').trim(); }
  return '';
};
const num = (s) => { const v = Number(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : 0; };
const toOurTerm = (legacy) => { const s = String(legacy ?? '').trim(); if (/^\d{3}$/.test(s)) return '13' + s; if (/^\d{4}$/.test(s)) return '1' + s; return s; };

(async () => {
  const students = await q('SELECT id, "studentCode" FROM students WHERE "universityId"=$1', [UNI]);
  const stuById = new Map(students.map(r => [String(r.studentCode), Number(r.id)]));
  const terms = await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]);
  const termById = new Map(terms.map(r => [String(r.termCode), Number(r.id)]));

  const tams = readTsv('TermAms.tsv');

  const stat = { rows: tams.rows.length, insertDec: 0, insertInc: 0, skipZero: 0, skipNoStudent: 0, skipNoTerm: 0, dup: 0, sumDec: 0, sumInc: 0, badRef: 0 };

  const planned = [];
  for (const r of tams.rows) {
    const stno = col(r, tams.header, 'StnO', 'Stno');
    const sid = stuById.get(stno);
    const tid = termById.get(toOurTerm(col(r, tams.header, 'TermCode')));
    const adj = num(col(r, tams.header, 'TSUMMab_Subject'));
    const amsId = col(r, tams.header, 'TermAmsId');
    if (!sid) { stat.skipNoStudent++; continue; }
    if (!tid) { stat.skipNoTerm++; continue; }
    if (!adj) { stat.skipZero++; continue; }
    const tt = adj < 0 ? 'TUITION_ADJUST_DEC' : 'TUITION_ADJUST_INC';
    const ref = Number(amsId);
    const refSafe = Number.isSafeInteger(ref) && ref >= 0 && ref <= 2000000000 ? ref : null;
    if (refSafe === null) stat.badRef++;
    planned.push({ sid, tid, tt, amt: Math.abs(adj), refSafe, amsId });
  }

  // idempotency: قبلاً درج‌شده‌ها را حذف کن (هر دو نوع — یک کوئری واحد)
  const have = new Set();
  {
    const rows = await q(`SELECT "referenceId", "transactionType" FROM student_ledger WHERE "transactionType" IN ('TUITION_ADJUST_DEC','TUITION_ADJUST_INC') AND "referenceId" IS NOT NULL AND "universityId"=$1`, [UNI]);
    for (const x of rows) have.add(`${Number(x.referenceId)}|${x.transactionType}`);
  }
  const existingKeys = new Set();
  if (planned.some(p => p.refSafe === null)) {
    const ex = await q(`SELECT "studentId","termId","transactionType" FROM student_ledger WHERE "transactionType" IN ('TUITION_ADJUST_DEC','TUITION_ADJUST_INC') AND "universityId"=$1`, [UNI]);
    for (const e of ex) existingKeys.add(`${e.studentId}|${e.termId}|${e.transactionType}`);
  }

  const todo = (p) => p.refSafe !== null ? !have.has(`${p.refSafe}|${p.tt}`) : !existingKeys.has(`${p.sid}|${p.tid}|${p.tt}`);
  console.log(`== INSERT TUITION_ADJUST (uni ${UNI}) ${DRY ? '[DRY]' : '[APPLY]'} ==`);
  const dec = planned.filter(p => p.tt === 'TUITION_ADJUST_DEC');
  const inc = planned.filter(p => p.tt === 'TUITION_ADJUST_INC');
  console.log(`planned DEC: ${dec.length} sum(rial): ${dec.reduce((a, p) => a + p.amt, 0).toLocaleString('en')}`);
  console.log(`planned INC: ${inc.length} sum(rial): ${inc.reduce((a, p) => a + p.amt, 0).toLocaleString('en')}`);
  console.log(`already inserted: ${have.size}`);

  if (DRY) {
    const t = planned.filter(todo);
    console.log(`todo after dedupe: ${t.length}`);
    for (const x of t.slice(0, 10)) console.log(`  sid=${x.sid} tid=${x.tid} ${x.tt}=${x.amt} ref=${x.amsId}`);
    await pool.end();
    return;
  }

  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    for (const p of planned) {
      if (!todo(p)) { stat.dup++; continue; }
      await tx.query(
        `INSERT INTO student_ledger ("studentId","termId","transactionType",amount,description,"referenceId","universityId")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.sid, p.tid, p.tt, p.amt, `تعدیل موضوعی قدیمی (TermAms id=${p.amsId})`, p.refSafe, UNI],
      );
      if (p.tt === 'TUITION_ADJUST_DEC') { stat.insertDec++; stat.sumDec += p.amt; }
      else { stat.insertInc++; stat.sumInc += p.amt; }
    }
    await tx.query('COMMIT');
  } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }

  console.log(`inserted DEC: ${stat.insertDec} sum=${stat.sumDec.toLocaleString('en')} | INC: ${stat.insertInc} sum=${stat.sumInc.toLocaleString('en')} | dup: ${stat.dup} | skipZero: ${stat.skipZero} | skipNoStudent: ${stat.skipNoStudent} | skipNoTerm: ${stat.skipNoTerm} | badRef: ${stat.badRef}`);
  await pool.end();
})().catch(e => { console.error('FATAL', e); try { pool.end(); } catch {} process.exit(1); });

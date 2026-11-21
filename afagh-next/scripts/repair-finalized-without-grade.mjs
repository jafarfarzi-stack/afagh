#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  repair-finalized-without-grade — ترمیم ردیفهای «نهایی بدون نمره»
 *
 *  شکاف: migrate-legacy-education.mjs تا ۱۴۰۵/۰۸/۳۰ عمداً gradeStatus را
 *  'FINALIZED' مینوشت حتی وقتی Mark/DonMark خالی (= literal «NULL») بود.
 *  نتیجه: ردیف ثبتنام (MarkStat=10) در پنل «نهایی» دیده میشد بدون نمره.
 *
 *  این اسکریپت تصمیم را **از خودِ منبع (SUS_grades.tsv)** میگیرد:
 *    ▸ نمره وجود ندارد + MarkStat جزو تصمیمات قطعی سما (معاف/قبول بدون
 *      نمره/مردود بدون نمره/حذف) ⇒ FINALIZED باقی میماند.
 *    ▸ نمره وجود ندارد + MarkStat=10 (یا هر کد غیرقطعی) ⇒ PENDING میشود.
 *    ▸ ردیفی که در منبع پیدا نشد ⇒ دستنخورده (fail-closed).
 *
 *  ایمنی: پیشفرض dry؛ نوشتن فقط با --apply و بکاپ JSONL اجباری که
 *  `{id, before, after}` هر ردیف تغییریافته را ثبت میکند (برای --restore).
 *
 *  اجرا (داخل کانتینر afagh_app، جایی که هم PG و هم TSV در دسترس است):
 *    node scripts/repair-finalized-without-grade.mjs \
 *      --sus /tmp/uems_weekly_edu/SUS_grades.tsv --db-host postgres --db-port 5432
 *    node scripts/repair-finalized-without-grade.mjs ... --apply \
 *      --backup /tmp/grade-repair-20261121.jsonl
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { FINAL_WITHOUT_GRADE_MS } from './lib/sama-grade-map.mjs';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    args[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
}
const APPLY = args.apply === 'true';
const BACKUP = args.backup && args.backup !== 'true' ? args.backup : '';
const RESTORE = args.restore && args.restore !== 'true' ? args.restore : '';
const SUS = args.sus || '/tmp/uems_weekly_edu/SUS_grades.tsv';
const DB_ENV = args['db-env'] || '';
const DB_HOST = args['db-host'] || 'postgres';
const DB_PORT = Number(args['db-port'] || 5432);

let password = String(process.env.POSTGRES_PASSWORD || '').trim();
if (!password && DB_ENV) {
  const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
  if (m) password = m[1].replace(/\r$/, '');
}
if (!password) throw new Error('POSTGRES_PASSWORD لازم است');

const num = (s) => { const v = Number(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(v) && String(s ?? '').trim() !== '' ? v : null; };
const int = (s) => { const n = num(s); return n == null ? null : Math.trunc(n); };
const toOurTerm = (legacy) => {
  const s = String(legacy ?? '').trim();
  if (/^\d{3}$/.test(s)) return '13' + s;
  if (/^\d{4}$/.test(s)) return '1' + s;
  return s;
};
const key = (stno, term, course, group) => `${stno}|${term}|${course}|${group}`;

const req = createRequire(import.meta.url);
const pgMod = req('pg');
const Pool = pgMod.Pool || pgMod.default?.Pool;
const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password, database: 'afagh_db', max: 5 });
const q = async (t, p) => (await pool.query(t, p)).rows;

async function main() {
  // ── حالت بازگردانی ──
  if (RESTORE) {
    const recs = readFileSync(RESTORE, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
    let n = 0;
    for (const r of recs.reverse()) {
      await q('UPDATE enrollments SET "gradeStatus"=$1 WHERE id=$2', [r.before, r.id]);
      n++;
    }
    console.log(`RESTORE: ${n}/${recs.length} ردیف به «${recs[0]?.before}» برگردانده شد`);
    await pool.end();
    return;
  }

  if (!existsSync(SUS)) throw new Error('SUS file not found: ' + SUS);
  if (APPLY && !BACKUP) throw new Error('--apply نیازمند --backup <file.jsonl> است');

  // ── ۱) کلیدهای «نمره ندارد ولی قطعی است» و «نمره ندارد و ثبتنام است» ──
  const finalKeys = new Set();   // نباید تغییر کند
  const pendingKeys = new Set(); // باید PENDING شود
  const txt = readFileSync(SUS, 'utf8');
  const lines = txt.split(/\r?\n/);
  const hdr = (lines[0] || '').replace(/^\uFEFF/, '').split('\t').map((h) => h.trim());
  const at = (cols, name) => { const i = hdr.indexOf(name); return i >= 0 ? String(cols[i] ?? '').trim() : ''; };
  let rows = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = lines[i].split('\t');
    const stno = at(c, 'Stno');
    if (!/^\d{7,14}$/.test(stno)) continue;
    const term = toOurTerm(at(c, 'TermCode'));
    const course = at(c, 'LessonCode');
    if (!course) continue;
    const group = int(at(c, 'LessonGroup')) ?? 1;
    const mark = num(at(c, 'Mark'));
    const don = num(at(c, 'DonMark'));
    const gradeValue = mark != null ? mark : don;
    if (gradeValue != null) continue; // نمره دارد ⇒ مشمول ترمیم نیست
    const ms = String(int(at(c, 'MarkStat')) ?? '').trim();
    const k = key(stno, term, course, group);
    rows++;
    if (FINAL_WITHOUT_GRADE_MS.includes(ms)) finalKeys.add(k);
    else pendingKeys.add(k);
  }
  console.log(`SUS: ${rows.toLocaleString()} ردیف بدون نمره — قطعی=${finalKeys.size.toLocaleString()} · غیرقطعی=${pendingKeys.size.toLocaleString()}`);

  // ── ۲) ردیفهای مشکوک در آفاق ──
  const bad = await q(`
    SELECT e.id, s."studentCode" AS stno, t."termCode" AS term, c.code AS course, o."groupNumber" AS grp
    FROM enrollments e
    JOIN students s ON s.id = e."studentId"
    JOIN course_offerings o ON o.id = e."offeringId"
    JOIN courses c ON c.id = o."courseId"
    JOIN academic_terms t ON t.id = o."termId"
    WHERE e."gradeStatus" = 'FINALIZED' AND e."gradeValue" IS NULL`);
  console.log(`آفاق: ${bad.length.toLocaleString()} ردیف «نهایی بدون نمره»`);

  let toFix = [], keepFinal = 0, noSource = 0;
  for (const r of bad) {
    const k = key(String(r.stno), String(r.term), String(r.course), Number(r.grp));
    if (finalKeys.has(k)) keepFinal++;
    else if (pendingKeys.has(k)) toFix.push(Number(r.id));
    else noSource++;
  }
  console.log(`تصمیم: PENDING=${toFix.length.toLocaleString()} · FINALIZED باقی=${keepFinal.toLocaleString()} · بدون منبع=${noSource.toLocaleString()} (دستنخورده)`);

  if (!APPLY) { console.log('*** DRY: بدون نوشتن ***'); await pool.end(); return; }

  const fd = openSync(BACKUP, 'w');
  try {
    for (let i = 0; i < toFix.length; i += 500) {
      const chunk = toFix.slice(i, i + 500);
      await q(`UPDATE enrollments SET "gradeStatus"='PENDING' WHERE id = ANY($1::int[]) AND "gradeStatus"='FINALIZED' AND "gradeValue" IS NULL`, [chunk]);
      for (const id of chunk) writeSync(fd, JSON.stringify({ id, before: 'FINALIZED', after: 'PENDING' }) + '\n', 'utf8');
    }
  } finally { closeSync(fd); }
  console.log(`APPLY: ${toFix.length.toLocaleString()} ردیف به PENDING اصلاح شد — بکاپ=${BACKUP}`);
  await pool.end();
}

main().catch(async (e) => { console.error('FATAL', e); try { await pool.end(); } catch { /* ignore */ } process.exit(1); });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { /* main already invoked */ }

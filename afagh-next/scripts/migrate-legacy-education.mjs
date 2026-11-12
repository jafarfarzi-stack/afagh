#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration آموزشی: uems (SQL قدیمی) → ساختار جدید (PG)
 *
 *  منبع: فایل‌های TSV حاصل از extract-legacy-education.mjs
 *    LT7_lessons            → courses (کاتالوگ دروس)
 *    CSRUnit + LT51 + CSRUnitLessonTypeSumUnit → چارت «درس به تفکیک ورودی»
 *    LT52_offerings         → course_offerings (ارائهٔ ترم)
 *    LT55_sessions          → schedules (CLASS هفتگی)
 *    SUS_grades             → enrollments + grade (نمرات/انتخاب واحد)
 *    StudentLessonsHistory  → legacy_grades (تاریخچهٔ کامل)
 *    TermCodes              → academic_terms (تعریف ترم)
 *
 *  قانون: idempotent با (universityId + کد)؛ همهٔ insertها universityId صریح
 *  دارند. فعلاً فقط آفاق (--uni 1)؛ ستونها ثابتاند و --uni دیگری هم کار میکند.
 *
 *  ── بارگذاری دستهأی (۲۰۲۶-۱۱-۱۲) ──────────────────────────────────────
 *  نسخهٔ قبل برای هر ردیف SUS/StudentLessonsHistory/LT55 یک SELECT ارائه و
 *  یک INSERT جدا میفرستاد: ≈۲٫۵ میلیون round-trip و ۶٬۹۰۱ ثانیه روی لایو.
 *  الان: TSVهای بزرگ جریانی خوانده میشوند، نقشهٔ offeringId یکبار از DB
 *  گرفته میشود، و INSERTها با unnest در قطعههای --chunk انجام میشوند.
 *  schedules هیچ ایندکس یکتایی ندارد (ON CONFLICT DO NOTHING بیاثر بود و
 *  اجراهای قبل ردیف تکراری ساختند) ⇒ ایدمپاتنسی با Set در حافظه تأمین میشود.
 *
 *    node migrate-legacy-education.mjs --dir <tsv> --db-host <ip> --uni 1            (dry)
 *    node migrate-legacy-education.mjs --dir <tsv> --db-host <ip> --uni 1 --apply
 *    node migrate-legacy-education.mjs --dir <tsv> --apply --chunk 5000
 *
 *  تعمیر تکراریهای قدیمی schedules (اختیاری، نیازمند --apply و --backup):
 *    node migrate-legacy-education.mjs --apply --dedupe-schedules --dedupe-only \
 *         --backup ./schedules-dupes.jsonl
 *
 *  Flags: --db-env /root/afagh/.env  --terms <terms.tsv>  --chunk N
 *         --dedupe-schedules --dedupe-only --backup <jsonl>
 * ══════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  BULK, BulkWriter, CHUNK_DEFAULT, OFFERING_KEY, scheduleKey,
  enrollmentKey, historyKey, EXISTING_KEYS_SQL,
  readTsvStream as streamFrom, DEDUPE_SELECT_SQL, DEDUPE_DELETE_SQL,
} from './lib/legacy-education-batch.mjs';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) { const k = raw[i].slice(2); args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true'; }
}
const APPLY = args.apply === 'true';
const UNI = Number(args.uni || 1);
const DIR = args.dir || '/tmp/lp2v2/edu_export_uems';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.3';
const DB_PORT = Number(args['db-port'] || 5432);
const TERMS_FILE = args.terms || '';
const CHUNK = Math.max(1, Number(args.chunk || CHUNK_DEFAULT));
const DEDUPE = args['dedupe-schedules'] === 'true';
const DEDUPE_ONLY = args['dedupe-only'] === 'true';
const BACKUP = args.backup && args.backup !== 'true' ? args.backup : '';

const req = createRequire(import.meta.url);
const { Pool } = req('pg');

let pool;
let q;

const readTsv = (name) => {
  let p = join(DIR, name);
  if (!existsSync(p)) p = join(DIR, name + '.tsv');
  if (!existsSync(p)) return { header: [], rows: [] };
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map(l => l.split('\t'));
  return { header, rows };
};

/** پوشهٔ ورودی را به لایهٔ جریانی مشترک پین میکنیم. */
const readTsvStream = (name) => streamFrom(DIR, name);

const col = (row, header, ...names) => {
  for (const n of names) {
    let i = header.indexOf(n);
    if (i < 0) i = header.findIndex(h => h.toLowerCase() === n.toLowerCase());
    if (i >= 0 && i < row.length) return String(row[i] ?? '').trim();
  }
  return '';
};
const num = (s) => { const v = Number(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(v) && String(s ?? '').trim() !== '' ? v : null; };
const int = (s) => { const n = num(s); return n == null ? null : Math.trunc(n); };
const toOurTerm = (legacy) => {
  const s = String(legacy ?? '').trim();
  if (/^\d{3}$/.test(s)) return '13' + s;      // 902 → 13902
  if (/^\d{4}$/.test(s)) return '1' + s;       // 1390 → 11390 (outlier)
  if (/^\d{5}$/.test(s)) return s;             // 14051 / 13831
  return s;
};
/** زمان کلاس LT55: HHMM (یا HH:MM) → «HH:MM» قابلقبول برای time بدون منطقهٔ زمانی.
 *  هر مقدار نامعتبر (خالی، منفی، ساعت>۲۳، دقیقه>۵۹، متن) ⇒ null. */
const toClock = (s) => {
  const v = String(s ?? '').trim().replace(/[,\s]/g, '');
  if (!v) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return h <= 23 && m <= 59 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
  }
  if (!/^\d{1,4}$/.test(v)) return null;
  const p = v.padStart(4, '0');
  const h = Number(p.slice(0, 2));
  const m = Number(p.slice(2));
  return h <= 23 && m <= 59 ? `${p.slice(0, 2)}:${p.slice(2)}` : null;
};

export { col, num, int, toOurTerm, toClock, readTsv, readTsvStream, scheduleKey };

const START = Date.now();
const report = {
  dry: !APPLY, uni: UNI, chunk: CHUNK, terms: null, courses: null, chart: null,
  offerings: null, grades: null, history: null, sessions: null, errors: [],
  batches: [], dedupe: null, elapsedSeconds: null,
};
const writers = [];
const writer = (spec, label) => {
  const w = new BulkWriter(pool, spec, { chunk: CHUNK, label, enabled: APPLY });
  writers.push(w);
  return w;
};
const flushAllSummaries = () => { report.batches = writers.map(w => w.summary()); };
const finish = async () => {
  flushAllSummaries();
  report.elapsedSeconds = Number(((Date.now() - START) / 1000).toFixed(3));
  console.log('\n=== REPORT (dry=' + report.dry + ') ===');
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) console.log('*** DRY: فقط گزارش، بدون نوشتن *** (برای اعمال: --apply)');
  if (pool) await pool.end();
};

const loadOfferings = async () => {
  const rs = await q('SELECT id, "termId", "courseId", "groupNumber" FROM course_offerings WHERE "universityId"=$1', [UNI]);
  const keys = new Set();
  const ids = new Map();
  for (const r of rs) {
    const k = OFFERING_KEY(r.termId, r.courseId, r.groupNumber);
    keys.add(k);
    const id = Number(r.id);
    const prev = ids.get(k);
    if (prev == null || id < prev) ids.set(k, id); // معادل LIMIT 1 قدیم، ولی قطعی
  }
  return { keys, ids };
};

const loadCourses = async () => new Map(
  (await q('SELECT code, id FROM courses WHERE "universityId"=$1', [UNI]))
    .map(r => [String(r.code), Number(r.id)]));

/**
 * کلیدهای موجود را یکبار میگیریم تا اجرای هفتگیِ بدون تغییر داده، هیچ INSERT
 * بیفایده صادر نکند. ON CONFLICT DO NOTHING همچنان پشتوانهٔ همزمانی باقی است.
 */
const loadKeySet = async (sql) => new Set((await q(sql, []))[0]?.keys || []);

/** تعمیر ردیفهای تکراری ساختهشده توسط اجراهای قبل (فقط ردیفهای مهاجرت). */
async function dedupeSchedules() {
  if (!APPLY) throw new Error('--dedupe-schedules نیازمند --apply است');
  if (!BACKUP) throw new Error('--dedupe-schedules نیازمند --backup <file.jsonl> است (بکاپ قابل بازگردانی اجباری)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doomed = (await client.query(DEDUPE_SELECT_SQL, [UNI])).rows;
    writeFileSync(BACKUP, doomed.map(r => JSON.stringify(r)).join('\n') + (doomed.length ? '\n' : ''), 'utf8');
    const del = await client.query(DEDUPE_DELETE_SQL, [UNI]);
    await client.query('COMMIT');
    const out = { deleted: Number(del.rowCount || 0), backupRows: doomed.length, backup: BACKUP };
    console.log(`dedupe schedules: ${out.deleted} حذف شد، ${out.backupRows} ردیف در ${BACKUP} پشتیبانگیری شد`);
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    const envTxt = readFileSync(DB_ENV, 'utf8');
    const m = envTxt.match(/^POSTGRES_PASSWORD=(.*)$/m);
    if (!m) { console.error('POSTGRES_PASSWORD not found in ' + DB_ENV); process.exit(2); }
    pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });
    q = async (t, p) => (await pool.query(t, p)).rows;

    const uni = (await q('SELECT id, code, title FROM universities WHERE id=$1', [UNI]))[0];
    if (!uni) throw new Error('university not found: ' + UNI);
    console.log('university:', uni.code, uni.title, 'apply=', APPLY, 'dir=', DIR, 'chunk=', CHUNK);

    if (DEDUPE) {
      report.dedupe = await dedupeSchedules();
      if (DEDUPE_ONLY) { await finish(); return; }
    }

    // ── ترم‌ها: از فایل جدا (کاتالوگ ترم در قدیم تعریف نشده) ──
    const termsTsv = TERMS_FILE && existsSync(TERMS_FILE) ? readFileSync(TERMS_FILE, 'utf8').replace(/^\uFEFF/, '') : '';
    const termLines = termsTsv.split(/\r?\n/).filter(l => l.trim() !== '');
    const termDefs = termLines.length > 1
      ? termLines.slice(1).map(l => { const p = l.split('\t'); return { termCode: toOurTerm(p[0]), title: p[1], startDate: p[2] || null, endDate: p[3] || null, isCurrent: Number(p[4] || 0) }; })
      : [];
    console.log(`terms: ${termDefs.length} definitions from ${TERMS_FILE || '(none)'}`);
    const terms = termDefs.length
      ? termDefs
      : (await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]));
    const termIdByCode = new Map();
    if (terms[0] && 'id' in terms[0]) {
      for (const t of terms) termIdByCode.set(String(t.termCode), Number(t.id));
    }
    report.terms = termDefs.length;

    if (APPLY && termDefs.length) {
      for (const t of termDefs) {
        if (!/^\d{5}$/.test(t.termCode)) continue;
        if (termIdByCode.has(t.termCode)) {
          await q(`UPDATE academic_terms SET title=$1, "startDate"=$2, "endDate"=$3, "isCurrent"=$4 WHERE "universityId"=$5 AND "termCode"=$6`,
            [t.title, t.startDate, t.endDate, t.isCurrent, UNI, t.termCode]);
        } else {
          const ins = await q(`INSERT INTO academic_terms ("universityId","termCode",title,"startDate","endDate","isCurrent") VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [UNI, t.termCode, t.title, t.startDate, t.endDate, t.isCurrent]);
          termIdByCode.set(t.termCode, Number(ins[0].id));
        }
      }
      const fresh = await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]);
      termIdByCode.clear(); for (const x of fresh) termIdByCode.set(String(x.termCode), Number(x.id));
    } else if (!APPLY && !termDefs.length) {
      for (const x of terms) termIdByCode.set(String(x.termCode), Number(x.id));
    }

    // ── 1) کاتالوگ دروس ─────────────────────────────────────────────────
    const lt7 = readTsv('LT7_lessons');
    let existingCourses = await loadCourses();
    const seenCodes = new Set(existingCourses.keys());
    let courseAdded = 0, courseSkipped = 0;
    const cw = writer(BULK.courses, 'courses');
    const UEMS_TYPEMAP = { 0: 'نامشخص', 1: 'عمومی', 2: 'پایه', 3: 'تخصصی', 4: 'اصلي', 5: 'کارورزي', 6: 'آزمایشگاه', 7: 'کارگاه', 8: 'پروژه', 9: 'تخصصی انتخابی', 10: 'اختیاری', 11: 'مشترک', 13: 'الزامی مشترک', 14: 'اختصاصی', 16: 'تخصصی الزامی', 17: 'انتخابی', 18: 'الزامی', 19: 'اصلي تخصصی', 20: 'جبرانی', 22: 'پایان‌نامه', 40: 'معرفي به استاد', 50: 'خودخوان' };
    for (const r of lt7.rows) {
      const code = col(r, lt7.header, 'Code');
      if (!code) continue;
      if (seenCodes.has(code)) { courseSkipped++; continue; }
      const units = num(col(r, lt7.header, 'Unit'));
      const th = num(col(r, lt7.header, 'Th'));
      const oh = num(col(r, lt7.header, 'Oh'));
      const typeId = int(col(r, lt7.header, 'Type'));
      const title = col(r, lt7.header, 'Name') || code;
      const deptId = int(col(r, lt7.header, 'Daneshkadeh'));
      const courseType = UEMS_TYPEMAP[typeId] || 'تخصصی';
      await cw.push([UNI, code, title, units,
        oh != null ? oh : (th != null && units != null ? units - th : null), courseType, deptId]);
      // نسخهٔ قدیم فقط در حالت apply کد تازه را به نقشه اضافه میکرد (dry دوباره میشمرد)
      if (APPLY) seenCodes.add(code);
      courseAdded++;
    }
    await cw.flush();
    if (APPLY && courseAdded) existingCourses = await loadCourses();
    console.log(`courses: +${courseAdded} added, ${courseSkipped} existing  [${cw.statements} statements / ${cw.affected} rows]`);
    report.courses = { added: courseAdded, existing: courseSkipped };

    // ── 2) چارت «درس به تفکیک ورودی» ────────────────────────────────────
    const csr = readTsv('CSRUnit');
    const lt51 = readTsv('LT51_csr_lesson');
    const unitsByType = readTsv('CSRUnitLessonTypeSumUnit');
    const log = [];
    for (const r of csr.rows) {
      const csrId = int(col(r, csr.header, 'ID'));
      const reshte = int(col(r, csr.header, 'Reshte'));
      const enterTerm = col(r, csr.header, 'EnterTerm') || '';
      const entryYear = /^\d{5}$/.test(enterTerm) ? Number(enterTerm.slice(0, 4)) : (reshte || null);
      const rows = lt51.rows.filter(x => int(col(x, lt51.header, 'CSRUnitID')) === csrId);
      log.push({ reshte, entryYear, lessons: rows.length, units: unitsByType.rows.filter(u => int(col(u, unitsByType.header, 'CSRUnitID')) === csrId).length });
    }
    console.log(`chart entries (درس به تفکیک ورودی): ${log.length} CSRUnit → ${log.reduce((a, b) => a + b.lessons, 0)} lesson-links, ${log.reduce((a, b) => a + b.units, 0)} unit-type rows`);
    report.chart = log.length;

    // ── 3) ارائه‌های ترمی ────────────────────────────────────────────────
    const lt52 = readTsv('LT52_offerings');
    const offersByTerm = new Map((await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI])).map(r => [String(r.termCode), Number(r.id)]));
    const off0 = await loadOfferings();
    let existingOff = off0.keys;
    let offeringIdByKey = off0.ids;
    let off = 0, offSkip = 0;
    const ow = writer(BULK.offerings, 'course_offerings');
    for (const r of lt52.rows) {
      const termCode = toOurTerm(col(r, lt52.header, 'TermCode'));
      const termId = offersByTerm.get(termCode);
      const courseCode = col(r, lt52.header, 'LessonCode');
      if (!termId || !courseCode) { offSkip++; continue; }
      const courseId = existingCourses.get(courseCode);
      const groupNumber = int(col(r, lt52.header, 'LessonGroup')) ?? 1;
      if (!courseId || existingOff.has(OFFERING_KEY(termId, courseId, groupNumber))) { offSkip++; continue; }
      await ow.push([UNI, termId, courseId, groupNumber, 1, 200]);
      if (APPLY) existingOff.add(OFFERING_KEY(termId, courseId, groupNumber));
      off++;
    }
    await ow.flush();
    if (APPLY && off) {
      const fresh = await loadOfferings();
      existingOff = fresh.keys; offeringIdByKey = fresh.ids;
    }
    console.log(`offerings: +${off} added, ${offSkip} skipped (missing term/course/dup)  [${ow.statements} statements / ${ow.affected} rows]`);
    report.offerings = { added: off, skipped: offSkip };

    // ── 4) زمانبندی هفتگی (CLASS) ───────────────────────────────────────
    // schedules ایندکس یکتا ندارد ⇒ ON CONFLICT DO NOTHING هرگز عمل نمیکرد.
    // یک Set از کلید ردیفهای موجود، ایدمپاتنسی واقعی را بدون migration میدهد.
    const existingSchedules = new Set(
      (await q(`SELECT "universityId","offeringId","dayOfWeek","startTime","endTime"
                 FROM schedules WHERE "scheduleType"='CLASS'`, []))
        .map(r => scheduleKey(r.universityId, r.offeringId, r.dayOfWeek, r.startTime, r.endTime)));
    let sched = 0, schedDup = 0, schedNullTime = 0;
    const sw = writer(BULK.schedules, 'schedules');
    for await (const { header, row } of readTsvStream('LT55_sessions')) {
      const termCode = toOurTerm(col(row, header, 'TermCode'));
      const termId = offersByTerm.get(termCode);
      const courseId = existingCourses.get(col(row, header, 'LessonCode'));
      const groupNumber = int(col(row, header, 'LessonGroup')) ?? 1;
      if (!termId || !courseId) continue;
      const offeringId = offeringIdByKey.get(OFFERING_KEY(termId, courseId, groupNumber));
      if (!offeringId) continue; // همان SELECT ... LIMIT 1 قدیم
      const dayOfWeek = int(col(row, header, 'DayCode'));
      // LT55 «StartTime/EndTime» را HHMM ذخیره میکند (۷۳۰→07:30، ۱۵۴۵→15:45).
      const startTime = toClock(col(row, header, 'StartTime'));
      const endTime = toClock(col(row, header, 'EndTime'));
      sched++;
      // ستونهای time در PG NOT NULL اند؛ یک ردیف خراب نباید کل قطعه را بترکاند.
      if (startTime == null || endTime == null) { schedNullTime++; continue; }
      const key = scheduleKey(UNI, offeringId, dayOfWeek, startTime, endTime);
      if (existingSchedules.has(key)) { schedDup++; continue; }
      existingSchedules.add(key);
      await sw.push([UNI, offeringId, 'CLASS', dayOfWeek, startTime, endTime]);
    }
    await sw.flush();
    console.log(`weekly sessions (CLASS): ${sched} rows, ${schedDup} already present, ${schedNullTime} bad time  [${sw.statements} statements / ${sw.affected} rows]`);
    report.sessions = { mapped: sched, duplicatesSkipped: schedDup, invalidTimeSkipped: schedNullTime };

    // ── 5) نمرات/انتخاب واحد (SUS) ──────────────────────────────────────
    const students = new Map((await q('SELECT id, "studentCode" FROM students WHERE "universityId"=$1', [UNI])).map(r => [String(r.studentCode), Number(r.id)]));
    let existingEnrollments = await loadKeySet(EXISTING_KEYS_SQL.enrollments);
    let enr = 0, enrSkip = 0, enrPresent = 0;
    const ew = writer(BULK.enrollments, 'enrollments');
    for await (const { header, row } of readTsvStream('SUS_grades')) {
      const stno = col(row, header, 'Stno');
      const termCode = toOurTerm(col(row, header, 'TermCode'));
      const courseCode = col(row, header, 'LessonCode');
      const stuId = students.get(stno);
      const termId = offersByTerm.get(termCode);
      const courseId = existingCourses.get(courseCode);
      const groupNumber = int(col(row, header, 'LessonGroup')) ?? 1;
      if (!stuId || !termId || !courseId) { enrSkip++; continue; }
      const offeringId = offeringIdByKey.get(OFFERING_KEY(termId, courseId, groupNumber));
      if (!offeringId) { enrSkip++; continue; }
      const mark = num(col(row, header, 'Mark'));
      const don = num(col(row, header, 'DonMark'));
      const gradeValue = mark != null ? mark : don;
      const markStat = int(col(row, header, 'MarkStat'));
      const status = markStat === 10 && gradeValue == null ? 'REGISTERED' : 'FINALIZED';
      enr++;
      const key = enrollmentKey(stuId, offeringId);
      if (existingEnrollments.has(key)) { enrPresent++; }
      else {
        existingEnrollments.add(key); // تکراری درون فایل منبع هم فقط یکبار درج میشود
        await ew.push([UNI, stuId, offeringId, status, gradeValue, 'FINALIZED', null]);
      }
      if (enr % 250000 === 0) console.log(`  … enrollments ${enr} rows / ${ew.statements} statements / ${((Date.now() - START) / 1000).toFixed(1)}s`);
    }
    await ew.flush();
    existingEnrollments = null; // آزاد کردن ~۷۰۰هزار کلید پیش از ساخت Set تاریخچه
    console.log(`enrollments (SUS): ${enr} mapped, ${enrSkip} skipped, ${enrPresent} already present  [${ew.statements} statements / ${ew.affected} rows]`);
    report.grades = { mapped: enr, skipped: enrSkip, alreadyPresent: enrPresent };

    // ── 6) تاریخچهٔ کامل → legacy_grades ─────────────────────────────────
    const existingHistory = await loadKeySet(EXISTING_KEYS_SQL.legacyGrades);
    let h = 0, hPresent = 0;
    const hw = writer(BULK.legacyGrades, 'legacy_grades');
    for await (const { header, row } of readTsvStream('StudentLessonsHistory')) {
      const stno = col(row, header, 'STNO');
      const termCode = toOurTerm(col(row, header, 'TermCode'));
      const courseCode = col(row, header, 'LessonCode');
      const gradeValue = num(col(row, header, 'Mark')) ?? num(col(row, header, 'DonMark'));
      const key = historyKey('UEMS', stno, termCode, courseCode);
      if (existingHistory.has(key)) { hPresent++; }
      else {
        existingHistory.add(key);
        await hw.push(['UEMS', stno, termCode, courseCode, gradeValue,
          col(row, header, 'MarkStat') || null, UNI, 'PENDING']);
      }
      h++;
      if (h % 500000 === 0) console.log(`  … legacy_grades ${h} rows / ${hw.statements} statements / ${((Date.now() - START) / 1000).toFixed(1)}s`);
    }
    await hw.flush();
    console.log(`history rows (legacy_grades): ${h}, ${hPresent} already present  [${hw.statements} statements / ${hw.affected} rows]`);
    report.history = { rows: h, alreadyPresent: hPresent };

    await finish();
  } catch (e) {
    console.error('FATAL', e);
    try { if (pool) await pool.end(); } catch { /* ignore */ }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

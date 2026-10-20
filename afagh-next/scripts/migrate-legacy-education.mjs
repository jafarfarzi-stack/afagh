#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration آموزشی: uems (SQL قدیمی) → ساختار جدید (PG)
 *
 *  منبع: فایل‌های TSV حاصل از extract-legacy-education.mjs
 *    LT7_lessons            → courses (کاتالوگ دروس)
 *    CSRUnit + LT51 + CSRUnitLessonTypeSumUnit → چارت «درس به تفکیک ورودی» (ورودی=entryYear)
 *    MAININFO_students + People_identity → students (فعلاً فقط گزارش تطبیق؛ مبدأ اصلی سما است)
 *    LT52_offerings         → course_offerings (ارائهٔ ترم) (+ ردیف‌های پیش از ثبت‌نام)
 *    LT55_sessions          → schedules (CLASS هفتگی)
 *    SUS_grades             → enrollments + grade (نمرات/انتخاب واحد)
 *    StudentLessonsHistory  → legacy_grades (تاریخچهٔ کامل — برای مقایسه)
 *    TermCodes              → academic_terms (تعریف ترم)
 *
 *  قانون (همان مالی): idempotent با (universityId + کد)؛ همهٔ insertها
 *  universityId صریح دارند. فعلاً فقط برای آفاق (--uni 1) اجرا می‌شود؛ اما
 *  ستون‌ها ثابت‌اند و با --uni هر دانشگاه هم‌مدل دیگر هم کار می‌کند.
 *
 *  ترم‌بندی: کاتالوگ ترم در سیستم قدیم تعریف نشده؛ ترم‌ها را خودمان از یک
 *  فایل جدا (terms.tsv: termCode,title,start,end,isCurrent) می‌دهیم.
 *
 *    node migrate-legacy-education.mjs --dir <tsv> --db-host <ip> --uni 1            (dry)
 *    node migrate-legacy-education.mjs --dir <tsv> --db-host <ip> --uni 1 --apply
 *    Flags: --db-env /root/afagh/.env  --terms <path-to-terms.tsv>
 * ══════════════════════════════════════════════════════════════════════
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
const DIR = args.dir || '/tmp/lp2v2/edu_export_uems';
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.3';
const TERMS_FILE = args.terms || ''; // فایل جدا: termCode,title,startDate,endDate,isCurrent

const req = createRequire(resolve(DIR, '..', 'package.json'));
const { Pool } = req('pg');
const envTxt = readFileSync(DB_ENV, 'utf8');
const m = envTxt.match(/^POSTGRES_PASSWORD=(.*)$/m);
if (!m) { console.error('POSTGRES_PASSWORD not found in ' + DB_ENV); process.exit(2); }
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });
const q = async (t, p) => (await pool.query(t, p)).rows;

const readTsv = (name) => {
  const p = join(DIR, name);
  if (!existsSync(p)) return { header: [], rows: [] };
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
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
const num = (s) => { const v = Number(String(s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(v) && String(s ?? '').trim() !== '' ? v : null; };
const int = (s) => { const n = num(s); return n == null ? null : Math.trunc(n); };
const toOurTerm = (legacy) => {
  const s = String(legacy ?? '').trim();
  if (/^\d{3}$/.test(s)) return '13' + s;      // 902 → 13902
  if (/^\d{4}$/.test(s)) return '1' + s;       // 1390 → 11390 (outlier)
  if (/^\d{5}$/.test(s)) return s;             // 14051 / 13831
  return s;
};
const report = { dry: !APPLY, uni: UNI, terms: null, courses: null, chart: null, offerings: null, grades: null, history: null, errors: [] };

(async () => {
  try {
    const uni = (await q('SELECT id, code, title FROM universities WHERE id=$1', [UNI]))[0];
    if (!uni) throw new Error('university not found: ' + UNI);
    console.log('university:', uni.code, uni.title, 'apply=', APPLY, 'dir=', DIR);

    // ── ترم‌ها: از فایل جدا (کاتالوگ ترم در قدیم تعریف نشده) ──
    const termsTsv = existsSync(TERMS_FILE) ? readFileSync(TERMS_FILE, 'utf8').replace(/^\uFEFF/, '') : '';
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

    // ── 1) کاتالوگ دروس ──
    const lt7 = readTsv('LT7_lessons');
    const existingCourses = new Map((await q('SELECT code, id, "universityId" FROM courses WHERE "universityId"=$1', [UNI])).map(r => [String(r.code), Number(r.id)]));
    let courseAdded = 0, courseSkipped = 0;
    for (const r of lt7.rows) {
      const code = col(r, lt7.header, 'Code');
      if (!code) continue;
      if (existingCourses.has(code)) { courseSkipped++; continue; }
      const units = num(col(r, lt7.header, 'Unit'));
      const th = num(col(r, lt7.header, 'Th'));
      const oh = num(col(r, lt7.header, 'Oh'));
      const typeId = int(col(r, lt7.header, 'Type'));
      const title = col(r, lt7.header, 'Name') || code;
      const deptId = int(col(r, lt7.header, 'Daneshkadeh'));
      const UEMS_TYPEMAP = { 0: 'نامشخص', 1: 'عمومی', 2: 'پایه', 3: 'تخصصی', 4: 'اصلي', 5: 'کارورزي', 6: 'آزمایشگاه', 7: 'کارگاه', 8: 'پروژه', 9: 'تخصصی انتخابی', 10: 'اختیاری', 11: 'مشترک', 13: 'الزامی مشترک', 14: 'اختصاصی', 16: 'تخصصی الزامی', 17: 'انتخابی', 18: 'الزامی', 19: 'اصلي تخصصی', 20: 'جبرانی', 22: 'پایان‌نامه', 40: 'معرفي به استاد', 50: 'خودخوان' };
const courseType = UEMS_TYPEMAP[typeId] || 'تخصصی';
      if (APPLY) {
        const ins = await q(
          `INSERT INTO courses ("universityId", code, title, units, "practicalUnits", "courseType", "departmentId") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [UNI, code, title, units, oh != null ? oh : (th != null && units != null ? units - th : null), courseType, deptId]);
        existingCourses.set(code, Number(ins[0].id));
      }
      courseAdded++;
    }
    console.log(`courses: +${courseAdded} added, ${courseSkipped} existing`);
    report.courses = { added: courseAdded, existing: courseSkipped };

    // ── 2) چارت «درس به تفکیک ورودی» ──
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

    // ── 3) ارائه‌های ترمی ──
    const lt52 = readTsv('LT52_offerings');
    const existingOff = new Set((await q('SELECT "termId", "courseId", "groupNumber" FROM course_offerings WHERE "universityId"=$1', [UNI])).map(r => `${r.termId}|${r.courseId}|${r.groupNumber}`));
    const offersByTerm = new Map(await q('SELECT id, "termCode" FROM academic_terms WHERE "universityId"=$1', [UNI]).then(rs => rs.map(r => [String(r.termCode), Number(r.id)])));
    let off = 0, offSkip = 0;
    for (const r of lt52.rows) {
      const termCode = toOurTerm(col(r, lt52.header, 'TermCode'));
      const termId = offersByTerm.get(termCode);
      const courseCode = col(r, lt52.header, 'LessonCode');
      if (!termId || !courseCode) { offSkip++; continue; }
      const courseId = existingCourses.get(courseCode);
      const groupNumber = int(col(r, lt52.header, 'LessonGroup')) ?? 1;
      if (!courseId || existingOff.has(`${termId}|${courseId}|${groupNumber}`)) { offSkip++; continue; }
      if (APPLY) {
        const ins = await q(
          `INSERT INTO course_offerings ("universityId","termId","courseId","groupNumber","isActive","capacity") VALUES ($1,$2,$3,$4,1,$5) RETURNING id`,
          [UNI, termId, courseId, groupNumber, 200]);
        existingOff.add(`${termId}|${courseId}|${groupNumber}`);
      }
      off++;
    }
    console.log(`offerings: +${off} added, ${offSkip} skipped (missing term/course/dup)`);
    report.offerings = { added: off, skipped: offSkip };

    // ── 4) زمان‌بندی هفتگی (CLASS) ──
    const lt55 = readTsv('LT55_sessions');
    let sched = 0;
    for (const r of lt55.rows) {
      const termCode = toOurTerm(col(r, lt55.header, 'TermCode'));
      const termId = offersByTerm.get(termCode);
      const courseId = existingCourses.get(col(r, lt55.header, 'LessonCode'));
      const groupNumber = int(col(r, lt55.header, 'LessonGroup')) ?? 1;
      if (!termId || !courseId) continue;
      const off = (await q('SELECT id FROM course_offerings WHERE "universityId"=$1 AND "termId"=$2 AND "courseId"=$3 AND "groupNumber"=$4 LIMIT 1', [UNI, termId, courseId, groupNumber]))[0];
      if (!off) continue;
      const dayOfWeek = int(col(r, lt55.header, 'DayCode'));
      const startMin = int(col(r, lt55.header, 'StartTime'));
      const endMin = int(col(r, lt55.header, 'EndTime'));
      const toTime = (min) => min == null ? null : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      if (APPLY) {
        await q(
          `INSERT INTO schedules ("universityId","offeringId","scheduleType","dayOfWeek","startTime","endTime") VALUES ($1,$2,'CLASS',$3,$4,$5) ON CONFLICT DO NOTHING`,
          [UNI, off.id, dayOfWeek, toTime(startMin), toTime(endMin)]);
      }
      sched++;
    }
    console.log(`weekly sessions (CLASS): ${sched} rows`);
    report.sessions = sched;

    // ── 5) نمرات/انتخاب واحد (SUS) ──
    const sus = readTsv('SUS_grades');
    const students = new Map((await q('SELECT id, "studentCode" FROM students WHERE "universityId"=$1', [UNI])).map(r => [String(r.studentCode), Number(r.id)]));
    let enr = 0, enrSkip = 0;
    for (const r of sus.rows) {
      const stno = col(r, sus.header, 'Stno');
      const termCode = toOurTerm(col(r, sus.header, 'TermCode'));
      const courseCode = col(r, sus.header, 'LessonCode');
      const stuId = students.get(stno);
      const termId = offersByTerm.get(termCode);
      const courseId = existingCourses.get(courseCode);
      const groupNumber = int(col(r, sus.header, 'LessonGroup')) ?? 1;
      if (!stuId || !termId || !courseId) { enrSkip++; continue; }
      const off = (await q('SELECT id FROM course_offerings WHERE "universityId"=$1 AND "termId"=$2 AND "courseId"=$3 AND "groupNumber"=$4 LIMIT 1', [UNI, termId, courseId, groupNumber]))[0];
      if (!off) { enrSkip++; continue; }
      const mark = num(col(r, sus.header, 'Mark'));
      const don = num(col(r, sus.header, 'DonMark'));
      const gradeValue = mark != null ? mark : don;
      const markStat = int(col(r, sus.header, 'MarkStat'));
      const status = markStat === 10 && gradeValue == null ? 'REGISTERED' : 'FINALIZED';
      if (APPLY) {
        await q(
          `INSERT INTO enrollments ("universityId","studentId","offeringId","status","gradeValue","gradeStatus","enrolledByUserId")
           VALUES ($1,$2,$3,$4,$5,'FINALIZED',NULL) ON CONFLICT DO NOTHING`,
          [UNI, stuId, off.id, status, gradeValue]);
      }
      enr++;
    }
    console.log(`enrollments (SUS): ${enr} mapped, ${enrSkip} skipped`);
    report.grades = { mapped: enr, skipped: enrSkip };

    // ── 6) تاریخچهٔ کامل → legacy_grades ──
    const hist = readTsv('StudentLessonsHistory');
    const existingHist = new Set((await q('SELECT "termCode","courseCode" FROM legacy_grades WHERE "universityId"=$1', [UNI]).catch(() => [])).map(r => `${r.termCode}|${r.courseCode}`)); // approx
    let h = 0;
    for (const r of hist.rows) {
      const stno = col(r, hist.header, 'STNO');
      const termCode = toOurTerm(col(r, hist.header, 'TermCode'));
      const courseCode = col(r, hist.header, 'LessonCode');
      const gradeValue = num(col(r, hist.header, 'Mark')) ?? num(col(r, hist.header, 'DonMark'));
      if (APPLY) {
        await q(
          `INSERT INTO legacy_grades ("sourceCode","studentCode","termCode","courseCode","gradeValue","gradeRaw","universityId","compareStatus")
           VALUES ('UEMS',$1,$2,$3,$4,$5,$6,'PENDING') ON CONFLICT DO NOTHING`,
          [stno, termCode, courseCode, gradeValue, col(r, hist.header, 'MarkStat') || null, UNI]);
      }
      h++;
    }
    console.log(`history rows (legacy_grades): ${h} (unique: ${hist.rows.length})`);
    report.history = h;

    console.log('\n=== REPORT (dry=' + report.dry + ') ===');
    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) console.log('*** DRY: فقط گزارش، بدون نوشتن *** (برای اعمال: --apply)');
    await pool.end();
  } catch (e) {
    console.error('FATAL', e);
    process.exit(1);
  }
})();
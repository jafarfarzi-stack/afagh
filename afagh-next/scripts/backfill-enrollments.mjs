#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  بازسازی ثبت‌نام‌های جاافتاده از legacy_grades → enrollments
 *  — هر نمره‌ای که در legacy_grades هست ولی enrollment ندارد را می‌سازد:
 *      درس (placeholder) ← ارائه (TRANSFER, group از raw یا ۱) ← ثبت‌نام
 *  — وضعیت ثبت‌نام برای دروس حذفی (gradeStatus=DROPPED یا markStat حذف) → 'DROPPED'
 *  — idempotent: ON CONFLICT DO NOTHING / شرط «نداشتن ثبت‌نام»
 *
 *  استفاده:
 *    node scripts/backfill-enrollments.mjs [--db url] [--source AFAGH] [--dry]
 *    node scripts/backfill-enrollments.mjs --studentCode 4001156006 [--dry]
 * ══════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';

const { Pool } = pg;

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}

const SOURCE = (args.source || 'AFAGH').toUpperCase();
const STUDENT = (args.studentCode || '').trim();
const DRY = args.dry === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';

const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (text, params) => (await pool.query(text, params)).rows;

// وضعیت‌های حذف سما (هماهنگ با import-ساما و grade-status-codes)
const DROP_RAW = new Set(['4', '5', '6', '7', '8', '9', '14', '15', '20', '28', '29', '200', '201', '300', '931', '941', '951', '-91', '-1', '-3', '-4', '-5', '-6', '55', '52']);

/** استخراج markStat از raw JSON */
function markStatOf(rawJson) {
  if (!rawJson) return null;
  const r = typeof rawJson === 'string' ? rawJson : String(rawJson);
  if (r.startsWith('{')) {
    try { return JSON.parse(r).markStat ?? null; } catch { return null; }
  }
  const m = /"markStat"\s*:\s*"?([^",}]+)"?/.exec(r);
  return m ? m[1] : null;
}

/** گروهٔ ارائه از raw JSON (LessonGroup) */
function groupOf(rawJson, fallback = 1) {
  if (!rawJson) return fallback;
  const r = typeof rawJson === 'string' ? rawJson : String(rawJson);
  let g;
  if (r.startsWith('{')) {
    try { const o = JSON.parse(r); g = o.group ?? o.LessonGroup ?? null; } catch { g = null; }
  } else {
    const m = /"(?:group|LessonGroup)"\s*:\s*"?([^",}]+)"?/.exec(r);
    g = m ? m[1] : null;
  }
  if (g == null || g === '' || !/^\d+$/.test(String(g).trim())) return fallback;
  return Number(String(g).trim());
}

async function main() {
  const stuCond = STUDENT ? ` AND lg."studentCode" = $1` : '';
  const stuParam = STUDENT ? [STUDENT] : [];
  const whereSrc = SOURCE !== '*' ? ` lg."sourceCode" = $${stuParam.length + 1}` : ' TRUE';

  const rows = await q(
    `SELECT lg.id, lg."studentCode", lg."termCode", lg."courseCode", lg."gradeValue",
            lg."gradeStatus", lg.raw, lg."courseTitle", lg."batchId"
       FROM legacy_grades lg
      WHERE ${whereSrc}${stuCond}`,
    SOURCE !== '*' ? [...stuParam, SOURCE] : stuParam,
  );

  const students = new Map((await q(`SELECT id, "studentCode" FROM students`)).map(r => [r.studentCode, r.id]));
  const terms = new Map((await q(`SELECT id, "termCode", "startDate" FROM academic_terms`)).map(r => [r.termCode, r.id]));
  const courses = new Map((await q(`SELECT id, code FROM courses`)).map(r => [r.code, r.id]));
  const termStart = new Map((await q(`SELECT id, "startDate" FROM academic_terms`)).map(r => [r.id, r.startDate]));

  const stats = { total: rows.length, ok: 0, noStudent: 0, noTerm: 0, courseCreated: 0, offeringCreated: 0, enrollCreated: 0, enrollSkipped: 0, errors: [] };

  for (const r of rows) {
    const sid = students.get(r.studentCode);
    const tid = terms.get(r.termCode);
    if (!sid) { stats.noStudent++; continue; }
    if (!tid) { stats.noTerm++; continue; }

    let cid = courses.get(r.courseCode);
    if (!cid && !DRY) {
      const ins = await q(
        `INSERT INTO courses (code, title, "theoreticalUnits", "practicalUnits", units)
         VALUES ($1,$2,0,0,0) ON CONFLICT (code) DO NOTHING RETURNING id`,
        [r.courseCode, r.courseTitle || `درس مهاجرتی ${r.courseCode}`],
      );
      if (ins.length) { stats.courseCreated++; courses.set(r.courseCode, ins[0].id); cid = ins[0].id; }
      else { cid = courses.get(r.courseCode); if (!cid) { stats.errors.push(`درس ${r.courseCode} ساخته نشد`); continue; } }
    }
    if (!cid) { stats.errors.push(`درس ${r.courseCode} ندارد`); continue; }

    const group = groupOf(r.raw, 1);
    let off = await q(
      `SELECT id FROM course_offerings WHERE "termId"=$1 AND "courseId"=$2 AND "groupNumber"=$3 LIMIT 1`,
      [tid, cid, group],
    );
    let offId = off.length ? off[0].id : null;
    if (!offId && !DRY) {
      const ins = await q(
        `INSERT INTO course_offerings ("termId","courseId","groupNumber",capacity,"enrolledCount","offeringType","isActive")
         VALUES ($1,$2,$3,999,0,'TRANSFER',1) RETURNING id`,
        [tid, cid, group],
      );
      if (ins.length) { stats.offeringCreated++; offId = ins[0].id; }
      else { stats.errors.push(`ارائه برای ${r.courseCode}/${r.termCode} ساخته نشد`); continue; }
    }
    if (!offId) { stats.errors.push(`ارائه برای ${r.courseCode}/${r.termCode} نیست`); continue; }

    const has = await q(
      `SELECT id FROM enrollments WHERE "studentId"=$1 AND "offeringId"=$2 LIMIT 1`,
      [sid, offId],
    );
    if (has.length) { stats.enrollSkipped++; continue; }
    if (DRY) { stats.ok++; continue; }

    const rawMs = markStatOf(r.raw);
    const dropped = r.gradeStatus === 'DROPPED' || (rawMs != null && DROP_RAW.has(String(rawMs)));
    const enrStatus = dropped ? 'DROPPED' : 'REGISTERED';
    const gv = r.gradeValue == null ? null : String(r.gradeValue);
    const ins = await q(
      `INSERT INTO enrollments ("studentId","offeringId",status,"gradeValue","gradeStatus","hasEvaluated","registeredAt","samaGradeStatusCode")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("studentId","offeringId") DO NOTHING RETURNING id`,
      [sid, offId, enrStatus, gv, r.gradeStatus, gv != null ? 1 : 0, termStart.get(tid) || new Date(), rawMs],
    );
    if (ins.length) {
      stats.ok++; stats.enrollCreated++;
      await q(`UPDATE legacy_grades SET "compareStatus"='SAME', "compareNote"='بازسازی خودکار', "appliedAt"=now() WHERE id=$1`, [r.id]);
    } else {
      stats.enrollSkipped++;
    }
  }

  console.log(JSON.stringify({
    source: SOURCE, student: STUDENT || 'همه', dry: DRY,
    total: stats.total, ok: stats.ok, noStudent: stats.noStudent, noTerm: stats.noTerm,
    courseCreated: stats.courseCreated, offeringCreated: stats.offeringCreated,
    enrollCreated: stats.enrollCreated, enrollSkipped: stats.enrollSkipped, errors: stats.errors.slice(0, 20),
  }, null, 2));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  رانرِ اعمالِ معادل‌سازی‌های تأییدشده روی کارنامه (APPLY)
 *
 *  چرا این نام؟ قراردادِ ریپو kebab-case + منطقِ خالص در scripts/lib/ است
 *  (مستند در course-equivalence.mjs). `course-equivalence.mjs` فقط پیشنهاد،
 *  بازبینی و تصمیمِ انسانی می‌سازد و هرگز کارنامه را دست نمی‌زند؛ این فایل
 *  گامِ بعدی است: خواندنِ تصمیم‌های APPROVED و نوشتنِ نمره در کارنامهٔ محلی.
 *  پیشوندِ `apply-` یعنی «نوشتن» (مثل apply-0010-fix34038.mjs) و جمعِ
 *  `equivalences` همان نامِ جدولِ `course_equivalences` است؛ منطقِ خالص در
 *  `scripts/lib/apply-course-equivalences.mjs` و تست در
 *  `tests/apply-course-equivalences.test.ts` زندگی می‌کند.
 *
 *  ── چه می‌کند ──
 *  برای هر معادلِ APPROVED (decidedAt NOT NULL, rejected=0) با مبدأ AFAGH و
 *  هر جفتِ دانشجوییِ (همان users.id، standardCode برابر، رشتهٔ نرمال برابر —
 *  همان قانونِ جمعیتِ فازِ اندازه‌گیری)، نمره‌های «قبولِ» آفاق (دقیقاً با
 *  قاعدهٔ موتورها) را روی درسِ مقصد می‌نشاند؛ اگر دانشجوی محلی همان درس را
 *  پاس داشته باشد، چیزی نوشته نمی‌شود.
 *
 *  ── ایمنی ──
 *  • پیش‌فرض dry-run است؛ نوشتن فقط با --apply و فقط در یک تراکنش.
 *  • روی prod فقط خواندن: اتصال با PGOPTIONS read-only باز و راستی‌آزمایی
 *    می‌شود؛ --apply روی prod صریحاً رد می‌شود (کدِ خروج ۳).
 *  • هر ردیفِ درج‌شده `sourceUniversityId` + `sourceEnrollmentId` می‌گیرد
 *    (کلیدِ idempotency روی uq_enrollments_source_enrollment) و `universityId`
 *    روی هر سه جدولِ درج‌شده مهر می‌شود (ترم/ارائه/ثبت‌نام).
 *  • نمره با کدِ سمای ۱۶ («در معادل سازي پذيرفته شده بدون احتساب معدل»:
 *    واحد می‌دهد، معدل نه) و gradeStatus=FINALIZED نوشته می‌شود.
 *  • هیچ شهریه‌ای شارژ نمی‌شود: این مسیر `chargeTermTuition` یا هیچ نویسندهٔ
 *    دفتری (ledger) را صدا نمی‌زند — فقط INSERT در academic_terms /
 *    course_offerings / enrollments.
 *
 *  ── نمونه ──
 *    node scripts/apply-course-equivalences.mjs --university ZARINE --report /tmp/plan.csv
 *    node scripts/apply-course-equivalences.mjs --university ZARINE --apply --skip-blocked --report /tmp/plan.csv
 *    node scripts/apply-course-equivalences.mjs --target prod --university ZARINE
 * ══════════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

import { levelKey, majorKey } from './lib/course-equivalence.mjs';
import {
  EQUIV_SAMA_CODE,
  EQUIV_GRADE_STATUS,
  EQUIV_ENROLL_STATUS,
  EQUIV_TERM_TYPE,
  EQUIV_OFFERING_TYPE,
  EQUIV_TERM_TITLE,
  EQUIV_GROUP_NUMBER,
  EQUIV_CAPACITY,
  FINAL_LIKE_STATUSES,
  VERDICTS,
  BLOCKED_VERDICTS,
  isPassedEnrollment,
  passThreshold,
  buildPlan,
  summarizePlan,
  planToCsv,
} from './lib/apply-course-equivalences.mjs';

const { Pool } = pg;

// ───────────────────────────────────────────────────────────────────────────
//  CLI
// ───────────────────────────────────────────────────────────────────────────

const raw = process.argv.slice(2);
const repeatable = (flagName) => {
  const out = [];
  const long = `--${flagName}`;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === long && raw[i + 1] && !raw[i + 1].startsWith('--')) out.push(raw[++i]);
    else if (raw[i].startsWith(`${long}=`)) out.push(raw[i].slice(long.length + 1));
  }
  return out;
};
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
  }
}
const flag = (n) => args[n] === 'true' || args[n] === true;
const opt = (n, d) => (args[n] !== undefined && args[n] !== 'true' ? String(args[n]) : d);

const APPLY_RAW = flag('apply');
const DRY_RUN = flag('dry-run');
const REPORT_CSV = opt('report', null);
const SKIP_BLOCKED = flag('skip-blocked');
const TARGET = String(opt('target', 'dev')).toLowerCase();
const DB_URL = opt('db', process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db');
const PROD_HOST = process.env.AFAGH_PROD_HOST || '172.20.0.3';
const PROD_ENV_FILE = process.env.AFAGH_ENV_FILE || '/root/afagh/.env';
const UNI_FILTERS = repeatable('university').flatMap((v) => String(v).split(',')).map((s) => s.trim().toUpperCase()).filter(Boolean);
const EQUIV_FILTERS = repeatable('equivalence').flatMap((v) => String(v).split(',')).map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n));

const log = (...a) => console.log(...a);
const h1 = (t) => log(`\n${'═'.repeat(78)}\n  ${t}\n${'═'.repeat(78)}`);
const die = (msg, code = 2) => { console.error(`\n✗ ${msg}`); process.exit(code); };
const redact = (u) => String(u).replace(/:[^:@/]*@/, ':***@');

if (APPLY_RAW && DRY_RUN) die('--dry-run و --apply با هم سازگار نیستند (یکی را انتخاب کنید).');
const APPLY = APPLY_RAW && !DRY_RUN;

function prodPassword() {
  let txt;
  try {
    txt = fs.readFileSync(PROD_ENV_FILE, 'utf8');
  } catch {
    throw new Error(`فایل ${PROD_ENV_FILE} پیدا نشد — رمزِ prod را نمی‌توانم بخوانم.`);
  }
  const m = txt.match(/^POSTGRES_PASSWORD=(.*)$/m);
  if (!m) throw new Error('POSTGRES_PASSWORD در .env پیدا نشد.');
  return m[1].trim();
}

async function connect(target, writable) {
  if (target !== 'prod') {
    const pool = new Pool({ connectionString: DB_URL });
    return { pool, readOnly: false, label: `dev (${redact(DB_URL)})` };
  }
  const pw = prodPassword();
  if (!writable) {
    const pool = new Pool({
      host: PROD_HOST, port: 5432, user: 'afagh', password: pw,
      database: 'afagh_db', options: '-c default_transaction_read_only=on',
    });
    const chk = await pool.query(`SELECT current_setting('default_transaction_read_only') AS ro`);
    if (chk.rows[0].ro !== 'on') {
      await pool.end();
      throw new Error('اتصال به prod فقط‌خواندنی نشد — ابزار ادامه نمی‌دهد.');
    }
    return { pool, readOnly: true, label: `prod (${PROD_HOST}:5432/afagh_db, فقط‌خواندنی)` };
  }
  const pool = new Pool({ host: PROD_HOST, port: 5432, user: 'afagh', password: pw, database: 'afagh_db' });
  return { pool, readOnly: false, label: `prod (${PROD_HOST}:5432/afagh_db, ⚠ نوشتنِ مجازشده)` };
}

// ───────────────────────────────────────────────────────────────────────────
//  بارگذاری
// ───────────────────────────────────────────────────────────────────────────

async function loadUniversities(pool) {
  const { rows } = await pool.query(`SELECT id, code, title FROM universities ORDER BY id`);
  return rows;
}

/** معادل‌های APPROVED با مبدأ AFAGH: decidedAt NOT NULL و rejected=0. */
async function loadApproved(pool, afaghId, uniIds, equivIds) {
  let sql = `SELECT e.id, e."universityIdA", e."courseIdA", e."universityIdB", e."courseIdB",
                    e."matchMethod", e."matchScore", e.confidence
               FROM course_equivalences e
              WHERE e."universityIdA" = $1
                AND e."decidedAt" IS NOT NULL AND e.rejected = 0`;
  const params = [afaghId];
  if (uniIds.length) {
    params.push(uniIds);
    sql += ` AND e."universityIdB" = ANY($${params.length}::int[])`;
  }
  if (equivIds.length) {
    params.push(equivIds);
    sql += ` AND e.id = ANY($${params.length}::int[])`;
  }
  sql += ` ORDER BY e.id`;
  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({
    id: r.id, universityIdA: r.universityIdA, courseIdA: r.courseIdA,
    universityIdB: r.universityIdB, courseIdB: r.courseIdB, matchMethod: r.matchMethod,
  }));
}

/**
 * جمعیتِ آماده‌سازی — همان قانونِ فازِ اندازه‌گیری (course-equivalence.mjs):
 * همان users.id، و degree_level_configs.standardCode برابر، و رشتهٔ نرمال برابر.
 */
async function loadPairs(pool, afaghId, uniIds) {
  const [{ rows: dlcs }, { rows: majors }, { rows: students }] = await Promise.all([
    pool.query(`SELECT id, title, code, "standardCode" FROM degree_level_configs`),
    pool.query(`SELECT id, name FROM majors`),
    pool.query(
      `SELECT s.id, s."userId", s."universityId", s."degreeLevelId", s."majorId"
         FROM students s WHERE s."universityId" = ANY($1::int[])`,
      [[afaghId, ...uniIds]],
    ),
  ]);
  const dlcKey = new Map(dlcs.map((d) => [d.id, levelKey(d)]));
  const majorK = new Map(majors.map((m) => [m.id, majorKey(m.name)]));
  const afByUser = new Map();
  for (const s of students) {
    if (s.universityId !== afaghId) continue;
    if (!afByUser.has(s.userId)) afByUser.set(s.userId, []);
    afByUser.get(s.userId).push(s);
  }
  const pairs = [];
  const dropped = { noPair: 0, levelMismatch: 0, majorMismatch: 0, noLevel: 0, noMajor: 0 };
  for (const s of students) {
    if (s.universityId === afaghId) continue;
    const afList = afByUser.get(s.userId) || [];
    if (!afList.length) { dropped.noPair++; continue; }
    for (const af of afList) {
      const la = dlcKey.get(af.degreeLevelId);
      const ll = dlcKey.get(s.degreeLevelId);
      if (!la?.key || !ll?.key) { dropped.noLevel++; continue; }
      if (la.key !== ll.key) { dropped.levelMismatch++; continue; }
      const ma = majorK.get(af.majorId);
      const ml = majorK.get(s.majorId);
      if (!ma || !ml) { dropped.noMajor++; continue; }
      if (ma !== ml) { dropped.majorMismatch++; continue; }
      pairs.push({ afStudentId: af.id, localStudentId: s.id, universityIdB: s.universityId });
    }
  }
  return { pairs, dropped };
}

/** کفِ قبولیِ هر دانشجو: آیین‌نامه، وگرنه پیش‌فرضِ مقطع، وگرنه ۱۰ (مثل graduation-engine). */
async function loadRegulationPassing(pool, studentIds) {
  const out = new Map();
  if (!studentIds.length) return out;
  const { rows: st } = await pool.query(
    `SELECT s.id, s."regulationId", s."degreeLevelId", d."defaultPassingGrade"
       FROM students s LEFT JOIN degree_level_configs d ON d.id = s."degreeLevelId"
      WHERE s.id = ANY($1::int[])`,
    [studentIds],
  );
  const regIds = [...new Set(st.map((r) => r.regulationId).filter((v) => v != null))];
  const regPass = new Map();
  if (regIds.length) {
    const { rows: regs } = await pool.query(
      `SELECT id, "rulesConfig" FROM educational_regulations WHERE id = ANY($1::int[])`, [regIds]);
    for (const r of regs) {
      try {
        const cfg = JSON.parse(r.rulesConfig);
        const v = Number(cfg?.grading_and_gpa?.default_passing_grade);
        if (Number.isFinite(v) && v > 0) regPass.set(r.id, v);
      } catch { /* نادیده: پیش‌فرضِ مقطع می‌ماند */ }
    }
  }
  for (const r of st) {
    const rp = regPass.get(r.regulationId);
    const dp = Number(r.defaultPassingGrade);
    out.set(r.id, (Number.isFinite(rp) && rp > 0) ? rp : (Number.isFinite(dp) && dp > 0 ? dp : 10));
  }
  return out;
}

/** همهٔ سابقه‌های کارنامهٔ این دانشجوها با جزئیاتِ لازم برای قاعدهٔ «قبول» + ترم مبدأ. */
async function loadTranscriptRows(pool, studentIds, passingByStudent) {
  if (!studentIds.length) return [];
  const { rows } = await pool.query(
    `SELECT e.id AS "enrollmentId", e."studentId", o."courseId",
            e."gradeValue", e."gradeStatus", e."samaGradeStatusCode",
            c."gradingType", c."minPassedMark",
            t."termCode" AS "termCode", t."termType" AS "termType",
            t.title AS "termTitle", t."sortOrder" AS "termSortOrder",
            t."academicYear" AS "termAcademicYear",
            t."startDate" AS "termStartDate", t."endDate" AS "termEndDate"
       FROM enrollments e
       JOIN course_offerings o ON o.id = e."offeringId"
       JOIN courses c ON c.id = o."courseId"
       JOIN academic_terms t ON t.id = o."termId"
      WHERE e."studentId" = ANY($1::int[])`,
    [studentIds],
  );
  return rows.map((r) => ({
    enrollmentId: r.enrollmentId, studentId: r.studentId, courseId: r.courseId,
    gradeValue: r.gradeValue, gradeStatus: r.gradeStatus,
    samaGradeStatusCode: r.samaGradeStatusCode, gradingType: r.gradingType,
    minPassedMark: r.minPassedMark, regulationPassing: passingByStudent.get(r.studentId) ?? 10,
    termCode: r.termCode, termType: r.termType, termTitle: r.termTitle,
    termSortOrder: r.termSortOrder, termAcademicYear: r.termAcademicYear,
    termStartDate: r.termStartDate, termEndDate: r.termEndDate,
  }));
}

// ───────────────────────────────────────────────────────────────────────────
//  جای‌گذاریِ هدف (ترم/ارائه) — قراردادِ applyEquivalenceBatch + مهر universityId
// ───────────────────────────────────────────────────────────────────────────

/**
 * ترمِ مقصد = دقیقاً همان کدِ ترمِ مبدأِ آفاق، در ترمِ «عادی» دانشگاه محلی.
 * اگر دانشگاه محلی آن کد را دارد، همان را reuse می‌کند (ترجیح با NORMAL؛ ولی
 * هر چه باشد، کدِ یکسان مهم‌تر از نوع است). اگر ندارد، آن را به‌صورت NORMAL
 * می‌سازد و عنوان/تاریخ/ترتیب را از ترمِ مبدأِ آفاق کپی می‌کند.
 * ترمِ معادل‌سازیِ مصنوعی (00EQ) دیگر ساخته نمی‌شود.
 */
async function ensureSameCodeTerm(db, universityId, afaghTermCode, afaghTerm) {
  const uni = Number(universityId);
  const code = String(afaghTermCode || '').trim();
  if (!code) throw new Error(`کدِ ترمِ مبدأ برای دانشگاه ${uni} خالی است — بدون ترمِ مبدأ، جای‌گذاری ممکن نیست.`);
  const { rows: have } = await db.query(
    `SELECT id, "termCode", "termType", "universityId"
       FROM academic_terms
      WHERE "universityId" = $1 AND "termCode" = $2
      ORDER BY CASE WHEN "termType" = 'NORMAL' THEN 0 ELSE 1 END, id LIMIT 2`,
    [uni, code],
  );
  const own = have.filter((r) => Number(r.universityId) === uni);
  if (own.length) return { term: own[0], created: false };
  // نیست: دقیقاً همین کد را به‌صورت NORMAL بساز
  const t = afaghTerm || {};
  await db.query(
    `INSERT INTO academic_terms
       ("universityId","termCode",title,"termType","sortOrder","academicYear",
        "isCurrent","isSummer","isEnrollmentOpen","startDate","endDate")
     VALUES ($1,$2,$3,'NORMAL',$4,$5,0,0,0,$6,$7)
     ON CONFLICT ("universityId","termCode") DO NOTHING`,
    [uni, code, t.termTitle || code, t.termSortOrder ?? null, t.termAcademicYear ?? null,
     t.termStartDate ?? null, t.termEndDate ?? null],
  );
  const { rows: again } = await db.query(
    `SELECT id, "termCode", "termType", "universityId" FROM academic_terms
      WHERE "universityId" = $1 AND "termCode" = $2 LIMIT 1`, [uni, code]);
  const term = again[0];
  if (!term || Number(term.universityId) !== uni) throw new Error(`ساختِ ترمِ ${code} برای دانشگاه ${uni} ممکن نشد.`);
  return { term, created: true };
}

async function ensureTransferOffering(db, universityId, courseId, termId) {
  const uni = Number(universityId);
  const { rows: have } = await db.query(
    `SELECT id FROM course_offerings
      WHERE "courseId" = $1 AND "termId" = $2 AND "offeringType" = $3 LIMIT 1`,
    [courseId, termId, EQUIV_OFFERING_TYPE],
  );
  if (have.length) return { offeringId: have[0].id, created: false };
  const { rows: made } = await db.query(
    `INSERT INTO course_offerings
       ("termId","courseId","groupNumber",capacity,"enrolledCount","offeringType","isActive","universityId")
     VALUES ($1,$2,$3,$4,0,$5,1,$6)
     ON CONFLICT DO NOTHING RETURNING id`,
    [termId, courseId, EQUIV_GROUP_NUMBER, EQUIV_CAPACITY, EQUIV_OFFERING_TYPE, uni],
  );
  if (made.length) return { offeringId: made[0].id, created: true };
  const { rows: again } = await db.query(
    `SELECT id FROM course_offerings
      WHERE "courseId" = $1 AND "termId" = $2 AND "offeringType" = $3 LIMIT 1`,
    [courseId, termId, EQUIV_OFFERING_TYPE],
  );
  if (!again.length) throw new Error(`ساختِ ارائهٔ TRANSFER برای courseId=${courseId} ممکن نشد.`);
  return { offeringId: again[0].id, created: true };
}

// ───────────────────────────────────────────────────────────────────────────
//  main
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  // نوشتن روی prod فقط با تصدیقِ صریحِ رشته‌ای مجاز است تا هیچ اجرای تصادفی
  // (cron، کپی‌پیست، فراموشیِ --target) نتواند به دیتابیس واقعی دست بزند.
  const CONFIRM = opt('confirm-prod-write', null);
  if (TARGET === 'prod' && APPLY && CONFIRM !== 'I-AUTHORIZE-PROD-WRITE')
    die('روی prod نوشتن ممنوع است (فقط dry-run). برای اجرای مجاز: --confirm-prod-write I-AUTHORIZE-PROD-WRITE', 3);

  const conn = await connect(TARGET, TARGET === 'prod' && APPLY);
  const { pool, readOnly, label } = conn;
  try {
    h1(`apply-course-equivalences — ${label}`);
    log(`حالت: ${APPLY ? 'APPLY (نوشتن در یک تراکنش)' : 'dry-run (فقط برنامه)'}   skip-blocked=${SKIP_BLOCKED ? 'بله' : 'خیر'}`);

    const unis = await loadUniversities(pool);
    const byCode = new Map(unis.map((u) => [String(u.code).trim().toUpperCase(), u]));
    const byId = new Map(unis.map((u) => [u.id, u]));
    const afagh = byCode.get('AFAGH');
    if (!afagh) die('دانشگاه AFAGH در جدول universities پیدا نشد.');

    let uniIds;
    if (UNI_FILTERS.length) {
      uniIds = [];
      for (const c of UNI_FILTERS) {
        const u = byCode.get(c);
        if (!u) die(`--university نامعتبر: ${c} (موجود: ${[...byCode.keys()].join('|')})`);
        if (u.id === afagh.id) die('--university نمی‌تواند AFAGH (مبدأ) باشد.');
        uniIds.push(u.id);
      }
    } else {
      uniIds = unis.map((u) => u.id).filter((id) => id !== afagh.id);
    }

    const equivalences = await loadApproved(pool, afagh.id, uniIds, EQUIV_FILTERS);
    log(`معادلِ APPROVEDِ مبدأ-AFAGH در scope: ${equivalences.length}` +
      (EQUIV_FILTERS.length ? ` (فیلتر equivalence: ${EQUIV_FILTERS.join(',')})` : ''));
    if (!equivalences.length) {
      log('کاری نیست — خروج.');
      return 0;
    }

    const targetUniIds = [...new Set(equivalences.map((e) => e.universityIdB))];
    const { pairs, dropped } = await loadPairs(pool, afagh.id, targetUniIds);
    log(`جفتِ دانشجوییِ (users.id یکسان + مقطع + رشته): ${pairs.length}` +
      `  حذف‌شده: ${JSON.stringify(dropped)}`);
    if (!pairs.length) {
      log('کاری نیست — خروج.');
      return 0;
    }

    const afIds = [...new Set(pairs.map((p) => p.afStudentId))];
    const localIds = [...new Set(pairs.map((p) => p.localStudentId))];
    const passingByStudent = await loadRegulationPassing(pool, [...afIds, ...localIds]);
    const [afaghRows, localRows] = await Promise.all([
      loadTranscriptRows(pool, afIds, passingByStudent),
      loadTranscriptRows(pool, localIds, passingByStudent),
    ]);

    const needCourseIds = [...new Set(equivalences.flatMap((e) => [e.courseIdA, e.courseIdB]))];
    const { rows: courseRefs } = await pool.query(
      `SELECT id, "universityId", code, title FROM courses WHERE id = ANY($1::int[])`, [needCourseIds]);
    const coursesById = new Map(courseRefs.map((c) => [c.id, c]));
    const courseMeta = new Map(courseRefs.map((c) => [c.id, c]));

    const srcIds = [...new Set(afaghRows.map((r) => r.enrollmentId))];
    const appliedSourceIds = new Set();
    if (srcIds.length) {
      const { rows: used } = await pool.query(
        `SELECT "sourceEnrollmentId" FROM enrollments WHERE "sourceEnrollmentId" = ANY($1::int[])`, [srcIds]);
      for (const r of used) appliedSourceIds.add(r.sourceEnrollmentId);
    }

    const plan = buildPlan({ equivalences, pairs, afaghRows, localRows, coursesById, appliedSourceIds });
    const sum = summarizePlan(plan);
    const uniName = (id) => byId.get(id)?.code || String(id);

    log(`\n── برنامه (${plan.length} سه‌تایی) ──`);
    for (const [v, n] of Object.entries(sum.by)) {
      if (n) log(`  ${v.padEnd(20)} ${n}`);
    }
    const perUni = new Map();
    for (const r of plan) {
      if (r.verdict !== VERDICTS.APPLY) continue;
      const k = uniName(r.universityIdB);
      perUni.set(k, (perUni.get(k) || 0) + 1);
    }
    if (perUni.size) {
      log('  قابلِ درج به‌تفکیک دانشگاه: ' + [...perUni.entries()].map(([k, n]) => `${k}=${n}`).join('  '));
    }
    const skipReasons = new Map();
    for (const r of plan) {
      if (r.verdict === VERDICTS.APPLY) continue;
      skipReasons.set(`${r.verdict} :: ${r.reason}`, (skipReasons.get(`${r.verdict} :: ${r.reason}`) || 0) + 1);
    }
    if (skipReasons.size) {
      log('\n── پرش‌ها (با دلیل، هیچ‌کدام خطا نیستند) ──');
      for (const [k, n] of skipReasons) log(`  ×${n}  ${k}`);
    }

    if (REPORT_CSV) {
      const enriched = plan.map((r) => {
        const a = courseMeta.get(r.courseIdA);
        const b = courseMeta.get(r.courseIdB);
        return {
          ...r,
          universityIdB: uniName(r.universityIdB),
          courseIdA: a ? `${r.courseIdA} (${a.code} — ${a.title})` : String(r.courseIdA),
          courseIdB: b ? `${r.courseIdB} (${b.code} — ${b.title})` : String(r.courseIdB),
        };
      });
      const abs = path.isAbsolute(REPORT_CSV) ? REPORT_CSV : path.join(process.cwd(), REPORT_CSV);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, planToCsv(enriched), 'utf8');
      log(`\nCSVِ برنامه: ${abs}`);
    }

    const applyRows = plan.filter((r) => r.verdict === VERDICTS.APPLY);
    const blocked = plan.filter((r) => BLOCKED_VERDICTS.has(r.verdict));
    if (!APPLY) {
      log('\nℹ️  --apply نیامده ⇒ فقط برنامه (dry-run). هیچ ردیفی نوشته نشد.');
      return 0;
    }
    if (readOnly) die('اتصال فقط‌خواندنی است؛ نوشتن ممکن نیست.', 3);
    if (blocked.length && !SKIP_BLOCKED) {
      console.error(`\n✗ ${blocked.length} سه‌تاییِ BLOCKED (${blocked.map((r) => r.verdict).join(',')}) وجود دارد و --skip-blocked داده نشده ⇒ هیچ نوشتنی انجام نشد.`);
      console.error('  برای اعمالِ بقیه، --skip-blocked بدهید (آنگاه فقط سطرهای مسدود رد می‌شوند).');
      process.exitCode = 2;
      return 2;
    }
    if (!applyRows.length) {
      log('\nکاری برای درج نیست — خروج (تراکنشی باز نشد).');
      return 0;
    }

    // ── یک تراکنش برای کلِ اجرا ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const termCache = new Map(); // uniB → term
      const offeringCache = new Map(); // `${courseIdB}:${termId}` → offeringId
      let termsCreated = 0;
      let offeringsCreated = 0;
      let inserted = 0;
      const skippedNow = [];
      const nowSources = [];

      for (const row of applyRows) {
        // بازبینیِ دوبارهٔ هر پیش‌شرط، درست پیش از نوشتن (درونِ همان تراکنش)
        const { rows: crs } = await client.query(
          `SELECT id, "universityId" FROM courses WHERE id = $1`, [row.courseIdB]);
        if (!crs.length || Number(crs[0].universityId) !== Number(row.universityIdB)) {
          skippedNow.push({ ...row, verdict: VERDICTS.NO_LOCAL_COURSE, reason: 'بازبینیِ درون‌تراکنشی: درسِ مقصد نیست' });
          continue;
        }
        const { rows: dup } = await client.query(
          `SELECT id FROM enrollments WHERE "sourceEnrollmentId" = $1`, [row.afaghEnrollmentId]);
        if (dup.length) {
          skippedNow.push({ ...row, verdict: VERDICTS.ALREADY_APPLIED, reason: 'بازبینیِ درون‌تراکنشی: همین sourceEnrollmentId اعمال شده' });
          continue;
        }
        const { rows: have } = await client.query(
          `SELECT e."gradeValue", e."gradeStatus", e."samaGradeStatusCode",
                  c."gradingType", c."minPassedMark"
             FROM enrollments e
             JOIN course_offerings o ON o.id = e."offeringId"
             JOIN courses c ON c.id = o."courseId"
            WHERE e."studentId" = $1 AND o."courseId" = $2`, [row.localStudentId, row.courseIdB]);
        const regPass = passingByStudent.get(row.localStudentId) ?? 10;
        if (have.some((h) => isPassedEnrollment({
          gradeValue: h.gradeValue, gradeStatus: h.gradeStatus,
          samaGradeStatusCode: h.samaGradeStatusCode, gradingType: h.gradingType,
          minPassedMark: h.minPassedMark, regulationPassing: regPass,
        }))) {
          skippedNow.push({ ...row, verdict: VERDICTS.ALREADY_PASSED_LOCAL, reason: 'بازبینیِ درون‌تراکنشی: دانشجوی محلی همان درس را پاس دارد' });
          continue;
        }

        // مقصد = همان کدِ ترمِ مبدأ، در ترمِ عادیِ دانشگاه محلی
        if (!row.afaghTermCode) {
          skippedNow.push({ ...row, verdict: VERDICTS.BLOCKED_NO_TERM, reason: 'کدِ ترمِ مبدأ خالی است — بدون آن، جای‌گذاریِ هم‌ترم ممکن نیست' });
          continue;
        }
        const tkey = `${row.universityIdB}:${row.afaghTermCode}`;
        if (!termCache.has(tkey)) {
          const { term, created } = await ensureSameCodeTerm(client, row.universityIdB, row.afaghTermCode, {
            termTitle: row.afaghTermTitle, termSortOrder: row.afaghTermSortOrder,
            termAcademicYear: row.afaghTermAcademicYear,
            termStartDate: row.afaghTermStartDate, termEndDate: row.afaghTermEndDate,
          });
          termCache.set(tkey, term);
          if (created) termsCreated++;
        }
        const term = termCache.get(tkey);
        const okey = `${row.courseIdB}:${term.id}`;
        if (!offeringCache.has(okey)) {
          const { offeringId, created } = await ensureTransferOffering(client, row.universityIdB, row.courseIdB, term.id);
          offeringCache.set(okey, offeringId);
          if (created) offeringsCreated++;
        }
        const offeringId = offeringCache.get(okey);

        const gradeParam = row.gradeValue === null || row.gradeValue === undefined || String(row.gradeValue).trim() === ''
          ? null : String(row.gradeValue);
        await client.query(
          `INSERT INTO enrollments
             ("studentId","offeringId",status,"gradeValue","gradeStatus",
              "samaGradeStatusCode","universityId","sourceUniversityId","sourceEnrollmentId","isDirectedReading")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0)`,
          [row.localStudentId, offeringId, EQUIV_ENROLL_STATUS, gradeParam,
            EQUIV_GRADE_STATUS, EQUIV_SAMA_CODE, row.universityIdB, afagh.id, row.afaghEnrollmentId],
        );
        inserted++;
        nowSources.push(row.afaghEnrollmentId);
      }

      // اثباتِ شمارش: هر چه قرار بود بنشیند، دقیقاً یک‌بار نشسته است
      const { rows: chk } = await client.query(
        `SELECT "sourceEnrollmentId", count(*)::int n FROM enrollments
          WHERE "sourceEnrollmentId" = ANY($1::int[]) GROUP BY 1`, [nowSources]);
      const seenCount = chk.length;
      const dupCount = chk.filter((r) => r.n !== 1).length;
      if (seenCount !== nowSources.length || dupCount > 0 || inserted !== nowSources.length) {
        await client.query('ROLLBACK');
        console.error(`\n✗ مغایرتِ شمارش (inserted=${inserted} seen=${seenCount} dups=${dupCount} planned=${nowSources.length}) ⇒ ROLLBACK شد.`);
        process.exitCode = 1;
        return 1;
      }

      await client.query('COMMIT');
      log(`\n✓ COMMIT شد: ${inserted} ردیف درج شد (ترمِ تازه: ${termsCreated}، ارائهٔ تازه: ${offeringsCreated}).`);
      if (skippedNow.length) {
        log(`  در بازبینیِ درون‌تراکنشی ${skippedNow.length} مورد رد شد (با دلیل، مسدودکننده نبود):`);
        const agg = new Map();
        for (const s of skippedNow) agg.set(`${s.verdict} :: ${s.reason}`, (agg.get(`${s.verdict} :: ${s.reason}`) || 0) + 1);
        for (const [k, n] of agg) log(`    ×${n}  ${k}`);
      }
      log(`  کدِ سما: ${EQUIV_SAMA_CODE} (بدون احتساب در معدل) · gradeStatus=${EQUIV_GRADE_STATUS} · status=${EQUIV_ENROLL_STATUS}`);
      log('  شهریه: هیچ شارژی انجام نشد (این مسیر ledger/tuition را صدا نمی‌زند).');
      return 0;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* نادیده */ }
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main()
  .then((c) => { process.exitCode = c ?? 0; })
  .catch((e) => { console.error(`\n✗ خطا: ${e.stack || e.message}`); process.exitCode = 1; });

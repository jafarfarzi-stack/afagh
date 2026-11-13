#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  import-new-master — ورود ردیفهای جدید دانشجو/استاد/رشته به آفاق
 *
 *  درخواست کاربر: «از این به بعد اگر ردیف دانشجو یا استاد یا درس یا رشتهٔ
 *  جدید ایجاد شده بود، هم به همراه کلیهٔ اطلاعات وارد گردد.»
 *  تقسیم کار:
 *    ▸ درس (LT7) و ارائه/ثبتنام → `migrate-legacy-education.mjs` هر هفته
 *      کاتالوگ دروس تازه را با جزئیات میسازد (courses: +N added).
 *    ▸ این اسکریپت سه master باقی‌مانده را میسازد:
 *        رشته    LT66_majors.tsv        → majors
 *        استاد   DONBIN_professors.tsv  → users + staff (+ نقش PROFESSOR)
 *        دانشجو  MAININFO_students.tsv  → users + students
 *
 *  ایمنی (fail-closed):
 *    ▸ فقط **درج** است — هیچ UPDATE/DELETE روی ردیفهای موجود (بهجز --restore).
 *    ▸ پیشفرض dry؛ نوشتن فقط با --apply و بکاپ JSONL اجباری که شناسهٔ هر
 *      ردیف ساختهشده را ثبت میکند؛ --restore همان را برمیگرداند.
 *    ▸ ON CONFLICT DO NOTHING + نقشهٔ کدهای موجود ⇒ اجرای مکرر بینه.
 *    ▸ ردیف ناقص (کد نامعتبر، بدون نام، رشته/مقطع/آیین‌نامه حل‌نشده، استاد
 *      غیرفعال یا «نامشخص») درج نمیشود — شمارش و نمونه در گزارش میرود.
 *    ▸ کدملی: IDNO ده‌رقمی معتبر؛ در غیر این صورت کد مصنوعی قطعی
 *      SA+۸رقم آخر کد دانشجویی / SD+۸رقم آخر کد استاد (یکتا در دانشگاه).
 *
 *  پرچمها: --dir (LT66/DONBIN) / --edu-dir (LT7 برای گزارش) /
 *          --students-dir (MAININFO) / --uni / --apply / --backup /
 *          --restore / --report / --db-host / --db-port / --db-env
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync, writeFileSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { mapSamaStatus, isValidStudentCode } from './lib/student-status-map.mjs';

// ── SQL های درج (قابلتست در tests/master-import-contract.test.ts) ──────────
export const MAJOR_INSERT_SQL = `
INSERT INTO majors (name, "majorCode", "degreeLevelId", "facultyId", "universityId")
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT ("universityId","majorCode") DO NOTHING
RETURNING id`;

export const COURSE_INSERT_SQL = `
INSERT INTO courses (code, title, "theoreticalUnits", "practicalUnits", units, "courseType", "departmentId", "universityId")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT ("universityId",code) DO NOTHING
RETURNING id`;

// users روی لایو قید یکتایی (nationalCode,universityId) ندارد ⇒ گارد NOT EXISTS
// (بینه در سطح DB؛ مسابقهٔ چندنویسه هم عملاً وجود ندارد — اجرا تکنویسه است).
export const USER_INSERT_SQL = `
INSERT INTO users ("nationalCode","firstName","lastName",gender,"passwordHash","isActive","mustChangePassword","universityId")
SELECT $1::varchar,$2::varchar,$3::varchar,$4::varchar,$5::varchar,1,1,$6::int
WHERE NOT EXISTS (SELECT 1 FROM users WHERE "nationalCode"=$1::varchar AND "universityId"=$6::int)
RETURNING id`;

export const STAFF_INSERT_SQL = `
INSERT INTO staff ("userId","staffCode",title,"facultyId","isActive","universityId")
VALUES ($1,$2,$3,$4,1,$5)
ON CONFLICT ("universityId","staffCode") DO NOTHING
RETURNING id`;

export const USER_ROLE_INSERT_SQL = `
INSERT INTO user_roles ("userId","roleId")
VALUES ($1,$2)
ON CONFLICT ("userId","roleId") DO NOTHING`;
// user_roles روی لایو ستون id ندارد (PK ترکیبی userId+roleId) ⇒ rowCount، نه RETURNING

export const STUDENT_INSERT_SQL = `
INSERT INTO students ("userId","studentCode","majorId","degreeLevelId","regulationId",
    "entryYear","entryTerm",status,"universityId","samaStatusCode","admissionSource","saminLocalFieldCode")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'LEGACY',$11)
ON CONFLICT ("universityId","studentCode") DO NOTHING
RETURNING id`;

export const USER_LOOKUP_SQL = `
SELECT id FROM users WHERE "nationalCode"=$1 AND "universityId"=$2`;

// ── توابع خالص (تستشدنی) ──────────────────────────────────────────────────
const NC_LEN = 10;

/** کدملی مصنوعی قطعی — 'S'+حرف منبع+۸ رقم آخر کد. */
export function placeholderNc(kind, code) {
  const pfx = 'S' + String(kind || 'A')[0].toUpperCase(); // A=دانشجو(Afagh) D=استاد(Donbin)
  return (pfx + String(code).replace(/\D/g, '').slice(-8).padStart(8, '0')).slice(0, NC_LEN);
}

const HONORIFICS = ['مهندس', 'دکتر', 'دكتر', 'آقاي', 'آقاى', 'سركار خانم', 'سرکار خانم', 'خانم', 'جناب'];

/**
 * نام استاد از DONBIN.Title — قالب «لقب نام‌خانوادگی-نام» یا «نام‌خانوادگی-نام».
 * لقب به staff.title و تفکیک نام به users میرود.
 */
export function parseProfessorName(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s || /^نامشخص$/i.test(s)) return null;
  let title = '';
  for (const h of HONORIFICS) {
    if (s.startsWith(h + ' ')) { title = h; s = s.slice(h.length + 1).trim(); break; }
  }
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const firstName = parts.length > 1 ? parts[parts.length - 1] : '';
  const lastName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
  if (!lastName) return null;
  return { honorific: title, firstName, lastName };
}

/** جنسیت از SEX سما: 1=زن، 2=مرد (نمونهٔ واقعی: «طاهره»=1، «مهدي»=2). */
export function genderFromSex(sex) {
  const v = String(sex ?? '').trim();
  if (v === '1') return 'FEMALE';
  if (v === '2') return 'MALE';
  return null;
}

/** انتخاب آیین‌نامه از سال ورود + مقطع — آینهٔ ensureRegulation در import-sama-afagh. */
export function regulationWhich(maghta, entryYear) {
  const m = String(maghta ?? '').trim();
  const ey = Number(entryYear) || 1400;
  if (m === '3') return '1394MS';
  if (['4', '6', '7', '8'].includes(m)) return '1394PHD';
  if (ey < 1391) return 'PRE1391';
  if (ey <= 1392) return '1391';
  if (ey <= 1401) return '1393';
  return '1402';
}

export const REG_TITLES = Object.freeze({
  R1402: 'آیین‌نامه ۱۴۰۲ — کاردانی و کارشناسی',
  R1393: 'آیین‌نامه ۱۳۹۳',
  R1391: 'آیین‌نامه ۱۳۹۱',
  R1394MS: 'آیین‌نامه ۱۳۹۴ — کارشناسی ارشد',
  R1394PHD: 'آیین‌نامه ۱۳۹۴ — دکتری',
  PRE1391: 'آیین‌نامه ماقبل ۱۳۹۱',
});

/** سال/ترم ورود از Startdate سما («1405/07/01») یا TERMCODE (14051). */
export function entryFrom(startdate, termcode) {
  const sd = String(startdate ?? '').trim();
  const m = sd.match(/^(\d{4})\/(\d{1,2})/);
  if (m) return { entryYear: Number(m[1]), entryTerm: Number(m[2]) <= 2 ? Number(m[2]) : 1 };
  const tc = String(termcode ?? '').trim();
  if (/^\d{4}[12]$/.test(tc)) return { entryYear: Number(tc.slice(0, 4)), entryTerm: Number(tc[4]) };
  return null;
}

// ── خواندن TSV منبع ──────────────────────────────────────────────────────
const readTsv = (dir, name, optional = false) => {
  const p = join(dir, name);
  if (!existsSync(p)) {
    if (optional) return { header: [], rows: [] };
    throw new Error('missing ' + p);
  }
  const txt = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split('\t').map((h) => h.trim());
  return { header, rows: lines.slice(1).map((l) => l.split('\t')) };
};
const col = (row, header, ...names) => {
  for (const n of names) {
    let i = header.indexOf(n);
    if (i < 0) i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
    if (i >= 0 && i < row.length) return String(row[i] ?? '').trim();
  }
  return '';
};

/**
 * ساخت برنامهٔ درج — تابع خالص (بدون DB). نقشههای مقصد از بیرون داده میشوند:
 *   majors: Map majorCode→id · courses: Map code→id · staff: Map staffCode→id
 *   students: Map studentCode→id · degrees: Map 'SAMA-n'→id
 *   faculties: Map facultyCode→id · departments: Map departmentCode→id
 *   users: Map nationalCode→id · regulations: Map title→id
 */
export function buildMasterPlan(src, maps, uni) {
  const lt66Rows = Array.isArray(src.lt66) ? src.lt66 : (src.lt66.rows ?? []);
  const lt66Hdr = src.lt66Header ?? (Array.isArray(src.lt66) ? [] : src.lt66.header);
  const donbinRows = Array.isArray(src.donbin) ? src.donbin : (src.donbin.rows ?? []);
  const donbinHdr = src.donbinHeader ?? (Array.isArray(src.donbin) ? [] : src.donbin.header);
  const mainRows = Array.isArray(src.maininfo) ? src.maininfo : (src.maininfo.rows ?? []);
  const mainHdr = src.maininfoHeader ?? (Array.isArray(src.maininfo) ? [] : src.maininfo.header);
  const {
    majors = new Map(), courses = new Map(), staff = new Map(), students = new Map(),
    degrees = new Map(), faculties = new Map(), departments = new Map(),
    users = new Map(), regulations = new Map(), professorRoleId = null,
  } = maps;

  const plan = {
    majors: [], professors: [], students: [],
    skipped: { majorJunk: 0, majorNoDegree: 0, majorNoFaculty: 0, duplicateMajor: 0,
      profJunk: 0, profInactive: 0, profUserTaken: 0,
      stuJunk: 0, stuBadCode: 0, stuNoMajor: 0, stuNoDegree: 0, stuNoRegulation: 0, stuNoEntry: 0, stuUserTaken: 0 },
    samples: { majors: [], professors: [], students: [], skippedStudents: [], skippedProfessors: [] },
  };

  // ── رشته‌ها (LT66) ───────────────────────────────────────────────────────
  for (const r of lt66Rows) {
    const code = col(r, lt66Hdr, 'Code');
    const title = col(r, lt66Hdr, 'Title');
    const maghta = col(r, lt66Hdr, 'Maghta');
    const danesh = col(r, lt66Hdr, 'Daneshkadeh');
    if (!/^\d{1,10}$/.test(code) || code === '0' || !title) { plan.skipped.majorJunk++; continue; }
    if (majors.has(code) || plan.majors.some((m) => m.code === code)) { plan.skipped.duplicateMajor++; continue; }
    const degId = degrees.get('SAMA-' + maghta);
    if (!degId) { plan.skipped.majorNoDegree++; if (plan.samples.majors.length < 10) plan.samples.majors.push({ code, title, reason: 'no-degree SAMA-' + maghta }); continue; }
    const facId = faculties.get(danesh) ?? null;
    if (facId == null && danesh && danesh !== '0') plan.skipped.majorNoFaculty++;
    plan.majors.push({ code, title, degreeLevelId: degId, facultyId: facId, universityId: uni });
    majors.set(code, -1); // درج داخل همین اجرا هم دیده شود (idempotency در batch)
  }

  // ── استادها (DONBIN) — فقط فعال با نام معتبر ─────────────────────────────
  for (const r of donbinRows) {
    const code = col(r, donbinHdr, 'Code');
    const name = parseProfessorName(col(r, donbinHdr, 'Title'));
    const active = col(r, donbinHdr, 'isActive') === '1';
    const danesh = col(r, donbinHdr, 'Daneshkadeh');
    if (!name || !/^\d{1,10}$/.test(code) || code === '0') { plan.skipped.profJunk++; continue; }
    if (!active) { plan.skipped.profInactive++; continue; }
    if (staff.has(code)) continue;
    const nc = placeholderNc('D', code);
    const owner = users.get(nc);
    if (owner !== undefined && owner !== null) { plan.skipped.profUserTaken++; continue; }
    plan.professors.push({
      code, nc, honorific: name.honorific, firstName: name.firstName, lastName: name.lastName,
      facultyId: faculties.get(danesh) ?? null,
      departmentId: departments.get(col(r, donbinHdr, 'GroupCode')) ?? null,
      universityId: uni, professorRoleId,
    });
  }

  // ── دانشجوها (MAININFO) — فقط کد معتبر با نام و رشتهٔ حلشده ─────────────
  for (const r of mainRows) {
    const code = col(r, mainHdr, 'STNO');
    const name = col(r, mainHdr, 'NAME').trim();
    const reshte = col(r, mainHdr, 'RESHTE');
    const maghta = col(r, mainHdr, 'MAGHTA');
    const idno = col(r, mainHdr, 'IDNO');
    const rawStatus = col(r, mainHdr, 'STATUS');
    if (!name) { plan.skipped.stuJunk++; continue; }
    if (!isValidStudentCode(code)) { plan.skipped.stuBadCode++; continue; }
    if (students.has(code)) continue;
    // majorId === -1 یعنی «رشتهٔ تازه که در همین اجرا درج میشود» ⇒ قابل حل است
    const majorId = majors.get(reshte) ?? null;
    if (majorId === null || (majorId <= 0 && majorId !== -1)) { plan.skipped.stuNoMajor++; if (plan.samples.skippedStudents.length < 15) plan.samples.skippedStudents.push({ code, name, reason: 'no-major ' + reshte }); continue; }
    const degId = degrees.get('SAMA-' + maghta);
    if (!degId) { plan.skipped.stuNoDegree++; continue; }
    const entry = entryFrom(col(r, mainHdr, 'Startdate'), col(r, mainHdr, 'TERMCODE'));
    if (!entry) { plan.skipped.stuNoEntry++; continue; }
    const regId = regulations.get(REG_TITLES['R' + regulationWhich(maghta, entry.entryYear)]);
    if (!regId) { plan.skipped.stuNoRegulation++; continue; }
    const validNc = /^\d{10}$/.test(idno) ? idno : '';
    const nc = validNc || placeholderNc('A', code);
    const owner = users.get(nc);
    if (owner !== undefined && owner !== null) { plan.skipped.stuUserTaken++; continue; }
    const status = mapSamaStatus(rawStatus) || 'UNKNOWN';
    plan.students.push({
      code, nc, ncSynthetic: !validNc,
      firstName: name.includes('-') ? name.split('-').pop().trim() : '',
      lastName: name.includes('-') ? name.split('-').slice(0, -1).join(' ').trim() : name,
      gender: genderFromSex(col(r, mainHdr, 'SEX')),
      birthDate: col(r, mainHdr, 'BIRTHDATE'),
      majorId, degreeLevelId: degId, regulationId: regId,
      entryYear: entry.entryYear, entryTerm: entry.entryTerm,
      status, rawStatus: String(rawStatus ?? '').trim() || null,
      universityId: uni, reshte,
    });
  }
  return plan;
}

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

let pool = null;
const q = async (t, p) => (await pool.query(t, p)).rows;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const APPLY = args.apply === 'true';
  const BACKUP = args.backup && args.backup !== 'true' ? args.backup : '';
  const RESTORE = args.restore && args.restore !== 'true' ? args.restore : '';
  const REPORT = args.report && args.report !== 'true' ? args.report : '';
  const UNI = Number(args.uni || 1);
  const DIR = args.dir || '';
  const EDU_DIR = args['edu-dir'] || '';
  const STU_DIR = args['students-dir'] || DIR;
  const DB_ENV = args['db-env'] || '';
  const DB_HOST = args['db-host'] || '172.20.0.3';
  const DB_PORT = Number(args['db-port'] || 5432);
  if (!DIR) throw new Error('--dir (پوشهٔ LT66/DONBIN) الزامی است');

  let password = String(process.env.POSTGRES_PASSWORD || '').trim();
  if (!password && DB_ENV) {
    if (!existsSync(DB_ENV)) throw new Error('db-env not found: ' + DB_ENV);
    const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
    if (!m) throw new Error('POSTGRES_PASSWORD not found in ' + DB_ENV);
    password = m[1].replace(/\r$/, '');
  }
  if (!password) throw new Error('رمز Postgres مقصد مشخص نشد (POSTGRES_PASSWORD یا --db-env)');
  const req = createRequire(import.meta.url);
  const pgMod = req('pg');
  const Pool = pgMod.Pool || pgMod.default?.Pool;
  if (!Pool) throw new Error('pg.Pool در دسترس نیست');
  pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password, database: 'afagh_db', max: 5 });

  try {
    // ── حالت بازگردانی: حذف ردیفهای ثبتشده در بکاپ (بهترتیب وابستگی) ─────
    if (RESTORE) {
      if (!existsSync(RESTORE)) throw new Error('backup file not found: ' + RESTORE);
      const recs = readFileSync(RESTORE, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
      let restored = 0;
      for (const rec of recs.reverse()) {
        try {
          if (rec.entity === 'student') await q('DELETE FROM students WHERE id=$1', [rec.id]);
          else if (rec.entity === 'staff') await q('DELETE FROM staff WHERE id=$1', [rec.id]);
          else if (rec.entity === 'major') await q('DELETE FROM majors WHERE id=$1', [rec.id]);
          else if (rec.entity === 'course') await q('DELETE FROM courses WHERE id=$1', [rec.id]);
          else if (rec.entity === 'user') {
            const used = (await q(`SELECT (SELECT 1 FROM students WHERE "userId"=$1 LIMIT 1) s,
                (SELECT 1 FROM staff WHERE "userId"=$1 LIMIT 1) t`, [rec.id]))[0];
            if (used && !used.s && !used.t) {
              await q('DELETE FROM user_roles WHERE "userId"=$1', [rec.id]);
              await q('DELETE FROM users WHERE id=$1', [rec.id]);
            } else { console.log('  user ' + rec.id + ' هنوز استفاده میشود — دست نخورد'); continue; }
          } else continue;
          restored++;
        } catch (e) {
          console.error('RESTORE STOP: ردیف ' + rec.entity + '#' + rec.id + ' حذف نشد (وابستگی؟): ' + e.message);
          break;
        }
      }
      console.log(`RESTORE: ${restored}/${recs.length} ردیف از ${RESTORE} بازگردانده شد`);
      await pool.end();
      return;
    }

    const uni = (await q('SELECT id, code, title FROM universities WHERE id=$1', [UNI]))[0];
    if (!uni) throw new Error('university not found: ' + UNI);
    console.log('university:', uni.code, uni.title, 'apply=', APPLY);

    // ── منابع ─────────────────────────────────────────────────────────────
    const lt66 = readTsv(DIR, 'LT66_majors.tsv');
    const donbin = readTsv(DIR, 'DONBIN_professors.tsv');
    const maininfo = readTsv(STU_DIR, 'MAININFO_students.tsv');
    const src = {
      lt66, lt66Header: lt66.header,
      donbin, donbinHeader: donbin.header,
      maininfo, maininfoHeader: maininfo.header,
    };

    // ── نقشههای مقصد (فقطخواندنی) ─────────────────────────────────────────
    const maps = {
      majors: new Map((await q(`SELECT id, "majorCode" FROM majors WHERE "majorCode" IS NOT NULL`)).map((r) => [String(r.majorCode), Number(r.id)])),
      courses: new Map((await q(`SELECT id, code FROM courses WHERE "universityId"=$1`, [UNI])).map((r) => [r.code, Number(r.id)])),
      staff: new Map((await q(`SELECT id, "staffCode" FROM staff WHERE "universityId"=$1`, [UNI])).map((r) => [r.staffCode, Number(r.id)])),
      students: new Map((await q(`SELECT id, "studentCode" FROM students WHERE "universityId"=$1`, [UNI])).map((r) => [r.studentCode, Number(r.id)])),
      degrees: new Map((await q(`SELECT id, code FROM degree_level_configs WHERE code LIKE 'SAMA-%'`)).map((r) => [r.code, Number(r.id)])),
      faculties: new Map((await q(`SELECT id, "facultyCode" FROM faculties WHERE "universityId"=$1`, [UNI])).map((r) => [r.facultyCode, Number(r.id)])),
      departments: new Map((await q(`SELECT id, "departmentCode" FROM departments WHERE "universityId"=$1`, [UNI])).map((r) => [r.departmentCode, Number(r.id)])),
      users: new Map((await q(`SELECT id, "nationalCode" FROM users WHERE "universityId"=$1`, [UNI])).map((r) => [r.nationalCode, Number(r.id)])),
      regulations: new Map((await q(`SELECT id, title FROM educational_regulations WHERE "universityId"=$1`, [UNI])).map((r) => [r.title, Number(r.id)])),
      professorRoleId: null,
    };
    maps.professorRoleId = Number((await q(`SELECT id FROM roles WHERE code='PROFESSOR' LIMIT 1`))[0]?.id ?? 0) || null;

    const plan = buildMasterPlan(src, maps, UNI);

    // حذف تکراری کدملی داخل برنامه (users قید DB ندارد) — دو ردیف سما با یک
    // کدملی معتبر = یک شخص؛ فقط نخستین کد دانشجویی وارد میشود و بقیه گزارش.
    plan.skipped.profNcDup = 0; plan.skipped.stuNcDup = 0;
    const seenNc = new Set();
    plan.professors = plan.professors.filter((p) => {
      if (seenNc.has(p.nc)) { plan.skipped.profNcDup++; return false; }
      seenNc.add(p.nc); return true;
    });
    plan.students = plan.students.filter((s) => {
      if (seenNc.has(s.nc)) { plan.skipped.stuNcDup++; return false; }
      seenNc.add(s.nc); return true;
    });

    // ── گیتها ─────────────────────────────────────────────────────────────
    console.log('\n── برنامهٔ ورود master تازه (UEMS → آفاق) ──');
    console.log(`  رشته: LT66=${lt66.rows.length}  درج=${plan.majors.length}  ردشده=${JSON.stringify({ junk: plan.skipped.majorJunk, noDegree: plan.skipped.majorNoDegree, dup: plan.skipped.duplicateMajor })}`);
    console.log(`  استاد: DONBIN=${donbin.rows.length}  درج=${plan.professors.length}  غیرفعال=${plan.skipped.profInactive}  ناقص=${plan.skipped.profJunk}`);
    console.log(`  دانشجو: MAININFO=${maininfo.rows.length}  درج=${plan.students.length}  ردشده=${JSON.stringify({ junk: plan.skipped.stuJunk, badCode: plan.skipped.stuBadCode, noMajor: plan.skipped.stuNoMajor, noDegree: plan.skipped.stuNoDegree, noReg: plan.skipped.stuNoRegulation, noEntry: plan.skipped.stuNoEntry })}`);
    for (const m of plan.majors.slice(0, 10)) console.log(`    +رشته ${m.code} «${m.title}»`);
    for (const p of plan.professors.slice(0, 10)) console.log(`    +استاد ${p.code} «${p.lastName} ${p.firstName}» nc=${p.nc}`);
    for (const s of plan.students.slice(0, 15)) console.log(`    +دانشجو ${s.code} «${s.lastName} ${s.firstName}» رشته=${s.reshte} ورود=${s.entryYear}/${s.entryTerm} nc=${s.ncSynthetic ? s.nc + '(مصنوعی)' : s.nc}`);
    for (const s of plan.samples.skippedStudents.slice(0, 8)) console.log(`    ~دانشجو ردشده ${s.code} «${s.name}»: ${s.reason}`);

    // گیت سخت: اگر سهم «دانشجوی نامدارِ حلنشده» غیرعادی بالا باشد، قرارداد منبع عوض شده
    const named = maininfo.rows.length - plan.skipped.stuJunk - plan.skipped.stuBadCode;
    const unresolved = plan.skipped.stuNoMajor + plan.skipped.stuNoDegree + plan.skipped.stuNoRegulation + plan.skipped.stuNoEntry;
    if (named > 0 && unresolved / named > 0.2) {
      throw new Error(`GATE: ${unresolved} از ${named} دانشجوی نامدار حلنشده است (>۲۰٪) — نگاشت رشته/مقطع/آیین‌نامه را بررسی کنید`);
    }
    if (APPLY && !BACKUP) throw new Error('--apply نیازمند --backup <file.jsonl> است');

    const report = {
      generatedAt: new Date().toISOString(),
      university: { id: uni.id, code: uni.code, title: uni.title },
      counts: {
        majors: plan.majors.length, professors: plan.professors.length, students: plan.students.length,
      },
      skipped: plan.skipped, samples: plan.samples,
      applied: false, backup: BACKUP || null, inserted: {},
    };
    if (!APPLY) {
      console.log('*** DRY: گزارش، بدون نوشتن ***');
      if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
      console.log(`SUMMARY majors=${plan.majors.length} profs=${plan.professors.length} students=${plan.students.length} dry=true`);
      await pool.end();
      return;
    }

    // ── اعمال: درجهای دستهای با بکاپ JSONL ────────────────────────────────
    const fd = openSync(BACKUP, 'w');
    const logRec = (entity, table, id, key) => writeSync(fd, JSON.stringify({ entity, table, id, key }) + '\n', 'utf8');
    const inserted = { majors: 0, courses: 0, professors: 0, students: 0 };
    // نقشهٔ runtime کد رشته → id واقعی (برای دانشجویانی که رشتهٔ تازهٔ همین اجرا را دارند)
    const majorIdRuntime = new Map([...maps.majors].filter(([, v]) => v > 0));
    try {
      // رشتهها
      for (const m of plan.majors) {
        const [row] = await q(MAJOR_INSERT_SQL, [m.title, m.code, m.degreeLevelId, m.facultyId, m.universityId]);
        if (row) { inserted.majors++; logRec('major', 'majors', row.id, m.code); majorIdRuntime.set(m.code, Number(row.id)); }
      }
      // استادها: users → staff → user_roles
      for (const p of plan.professors) {
        let uid = (await q(USER_INSERT_SQL, [p.nc, p.firstName, p.lastName, p.gender, 'MIGRATED:' + randomBytes(8).toString('hex'), p.universityId]))[0]?.id;
        if (!uid) uid = (await q(USER_LOOKUP_SQL, [p.nc, p.universityId]))[0]?.id;
        if (!uid) { plan.skipped.profUserTaken++; continue; }
        if (!maps.users.has(p.nc)) logRec('user', 'users', uid, p.nc);
        const [st] = await q(STAFF_INSERT_SQL, [uid, p.code, p.honorific || null, p.facultyId, p.universityId]);
        if (st) { inserted.professors++; logRec('staff', 'staff', st.id, p.code); }
        if (p.professorRoleId) await q(USER_ROLE_INSERT_SQL, [uid, p.professorRoleId]);
      }
      // دانشجوها: users → students
      for (const s of plan.students) {
        let mid = s.majorId;
        if (mid === -1) mid = majorIdRuntime.get(s.reshte) ?? null; // رشتهٔ تازهٔ همین اجرا
        if (!mid) { plan.skipped.stuNoMajor++; continue; }
        let uid = (await q(USER_INSERT_SQL, [s.nc, s.firstName, s.lastName, s.gender, 'MIGRATED:' + randomBytes(8).toString('hex'), s.universityId]))[0]?.id;
        if (!uid) uid = (await q(USER_LOOKUP_SQL, [s.nc, s.universityId]))[0]?.id;
        if (!uid) { plan.skipped.stuUserTaken++; continue; }
        if (!maps.users.has(s.nc)) logRec('user', 'users', uid, s.nc);
        const [st] = await q(STUDENT_INSERT_SQL, [uid, s.code, mid, s.degreeLevelId, s.regulationId,
          s.entryYear, s.entryTerm, s.status, s.universityId, s.rawStatus, s.reshte]);
        if (st) { inserted.students++; logRec('student', 'students', st.id, s.code); }
      }
    } finally { closeSync(fd); }
    if (!statSync(BACKUP).size) console.log('بکاپ خالی (هیچ درجی نشد): ' + BACKUP);
    report.applied = true;
    report.inserted = inserted;
    console.log(`apply: majors=${inserted.majors} professors=${inserted.professors} students=${inserted.students} بکاپ=${BACKUP}`);
    if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`SUMMARY majors=${inserted.majors} profs=${inserted.professors} students=${inserted.students} dry=false`);
    await pool.end();
  } catch (e) {
    console.error('FATAL', e);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

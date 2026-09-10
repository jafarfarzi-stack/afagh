#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  واردسازی TSV های سما (آفاق) — دانشجو، تکمیلی، ترم، رشته، نمرات
 *  — انکودینگ فایل‌ها: Windows-1256، جداکننده: تب
 *  — مقاوم به باینری عکس (ستون Pic) که سطرها را تکه‌تکه کرده است
 *  — idempotent: اجرای دوباره تکراری نمی‌سازد (ON CONFLICT DO NOTHING)
 *
 *  استفاده:
 *    node scripts/import-sama-afagh.mjs --dir "E:\git\information afagh" --dry
 *    node scripts/import-sama-afagh.mjs --dir ... --steps pre,terms,majors,students
 *    node scripts/import-sama-afagh.mjs --dir ... --steps grades,codemap
 *    node scripts/import-sama-afagh.mjs --dir ... --limit 500 --dry
 *
 *  ترتیب پیشنهادی: pre → terms → majors → students → grades → codemap
 * ══════════════════════════════════════════════════════════════════════
 */
import { readdirSync, statSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

// ── آرگومان‌ها ──
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const DIR = args.dir || 'E:\\git\\information afagh';
const SOURCE = (args.source || 'AFAGH').toUpperCase();
const STEPS = (args.steps || 'pre,terms,majors,groups,courses,links,students,grades,stterm,codemap').split(',').map(s => s.trim());
const LIMIT = args.limit ? Number(args.limit) : 0;
const DRY = args.dry === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';

const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (text, params) => (await pool.query(text, params)).rows;

// ── جلالی→میلادی (همان الگوریتم normalize.ts) ──
function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097);
  days %= 146097;
  if (days > 36524) { days--; gy += 100 * ~~(days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) { gy += ~~((days - 365) / 366); days = 365 - (days - 365); }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 12 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { gy, gm: gm + 1, gd };
}
function faDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const g = jalaliToGregorian(+m[1], +m[2], +m[3]);
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 8, 30, 0));
  return isNaN(d.getTime()) ? null : d;
}
function checkNationalCode(code) {
  if (!/^\d{10}$/.test(code)) return 'format';
  if (/^(\d)\1{9}$/.test(code)) return 'checksum';
  const sum = code.split('').slice(0, 9).reduce((s, d, i) => s + +d * (10 - i), 0);
  const r = sum % 11;
  return (r < 2 ? r : 11 - r) === +code[9] ? 'ok' : 'checksum';
}
// \x00 (باقی‌ماندهٔ باینری عکس در TSVها) را حذف می‌کند — پستگرس text/varchar با
// NUL بایت خطای invalid byte sequence for encoding "UTF8": 0x00 می‌دهد
const normTxt = (s) => String(s ?? '').replace(/\x00/g, '').replace(/\s+/g, ' ').trim();

// ── خواندن جریانی TSV با دیکد win1256 (امن برای بایت‌های باینری عکس) ──
const dec1256 = new TextDecoder('windows-1256');
async function* tsvRows(path, { skipHeader = true } = {}) {
  const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let lineNo = 0;
  let header = null;
  let yielded = 0;
  for await (const chunk of stream) {
    const buf = Buffer.concat([carry, chunk]);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) {
        lineNo++;
        const line = dec1256.decode(buf.subarray(start, i)).replace(/\r/g, '');
        start = i + 1;
        if (!line.trim()) continue;
        const cols = line.split('\t');
        if (skipHeader && !header) { header = cols.map(c => c.trim()); continue; }
        yielded++;
        yield { lineNo, cols };
        if (LIMIT && yielded >= LIMIT) { stream.destroy(); return { header, stopped: true }; }
      }
    }
    carry = buf.subarray(start);
  }
  return { header, stopped: false };
}
async function readHeaderOnly(path) {
  const fd = await import('node:fs/promises').then(m => m.open(path, 'r'));
  const b = Buffer.alloc(8192);
  const { bytesRead } = await fd.read(b, 0, 8192, 0);
  await fd.close();
  const t = dec1256.decode(b.subarray(0, bytesRead));
  for (const ln of t.split('\n')) {
    const c = ln.replace(/\r/g, '');
    if (c.trim().length > 3) return c.split('\t').map(x => x.trim());
  }
  return [];
}

// ── کشف فایل‌ها با امضای سرستون (مقاوم به نام فارسی) ──
async function detectFiles(dir) {
  const found = {};
  const cands = { students: [] };
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try { if (!statSync(p).isFile() || !/\.txt$/i.test(name)) continue; } catch { continue; }
    const h = await readHeaderOnly(p);
    const H = h.join('\t');
    const has = (...keys) => keys.every(k => h.includes(k));
    if (H.startsWith('STNO\tOLDSTNO\tNAME\tSEX')) cands.students.push({ p, size: statSync(p).size });
    else if (H.startsWith('Stno\tPriorReshteh')) found.supp = p;
    else if (H.startsWith('Stno\tTermCode\tLessonCode')) found.grades = p;
    else if (H.startsWith('TermCode\tStno\tStTermStatus')) found.stterm = p;
    else if (H.startsWith('TermCode\tLessonCode\tLessonGroup')) found.schedule = p;
    else if (H.startsWith('ID\tCSRUnitID\tLessonCode')) found.curriculum = p;
    else if (has('ProfessorID', 'NationalCode')) found.profs = p;
    else if (H.startsWith('Code\tBdate\tEdate')) found.terms = p;
    else if (has('Maghta', 'Daneshkadeh', 'MinUnit')) found.majors = p;
    else if (has('Avgeffect', 'Uniteffect')) found.markstat = p;
    // مقطعها امضای اختصاصی Mashrootmark دارد؛ وگرنه «تطبيق کد دروس» (MinPassedMark تنها) جایش را می‌گیرد
    else if (has('MinPassedMark') && has('Mashrootmark')) found.degrees = p;
    else if (has('IncludedTuition') && has('isDeleted')) found.lessonreg = p;
    else if (has('applicantIsActive')) found.accept = p;
    else if (has('SanjeshCode')) found.sahmiye = p;
    else if (h.join(" ").replace(/\u200c/g, "").includes("تغيير رشته") || h.join(" ").includes("فارغ التحصيل")) found.status = p;
    else if (has('كد','نام') && has('مقطع','گروه_اموزشي') && has('تعداد_واحد')) found.tatbigh = p;
    else if (has('GroupA','Daneshkadeh') && has('Code','Oldcode')) found.tatbighMap = p;
    else if (has('Code','Name','PlaceCode') && h.includes('Admin')) found.groups = p;
    else if (H.startsWith('Code\tTitle\tisActiveInTerm')) found.termstatus = p;
  }
  if (cands.students.length) {
    cands.students.sort((a, b) => {
      const a1 = /students1/i.test(a.name) ? 1 : 0;
      const b1 = /students1/i.test(b.name) ? 1 : 0;
      if (a1 !== b1) return b1 - a1; // students1 اول
      return b.size - a.size;
    });
    found.students = cands.students[0].p;
    if (cands.students[1]) found.studentsSubsetSkipped = cands.students[1].p;
  }
  return found;
}

// ── نگاشت‌ها ──
// استخراج‌شده از «وضعيت دانشجو.txt» سما — مرجع فارسی: src/lib/student-labels.ts
const SAMA_STATUS_MAP = {
  '1': 'ACTIVE', '5': 'ACTIVE', '10': 'ACTIVE', '23': 'ACTIVE', '26': 'ACTIVE',
  '2': 'GRADUATED', '9': 'GRADUATED', '25': 'GRADUATED',
  '41': 'GRADUATED', '42': 'GRADUATED', '43': 'GRADUATED',
  '44': 'GRADUATED', '45': 'GRADUATED', '46': 'GRADUATED',
  '16': 'EXPELLED', '34': 'EXPELLED',
  '17': 'WITHDRAWN', '18': 'WITHDRAWN', '35': 'WITHDRAWN', '12': 'WITHDRAWN',
  '22': 'SUSPENDED',
  '3': 'TRANSFERRED', '4': 'TRANSFERRED', '14': 'TRANSFERRED',
  '15': 'TRANSFERRED', '24': 'TRANSFERRED', '37': 'TRANSFERRED',
  '0': 'UNKNOWN', '11': 'UNKNOWN', '8': 'UNKNOWN',
  '21': 'NO_SHOW', '29': 'NO_SHOW', '7': 'NO_SHOW',
  '20': 'DECEASED', '6': 'DECEASED',
};
function mapStudentStatus(s) {
  s = String(s || '').trim();
  return SAMA_STATUS_MAP[s] || 'UNKNOWN';
}
const SHAHED_SAHM = new Set(['5', '6', '7', '8', '9', '11', '12', '13', '14', '15', '19', '21']);
const STAFF_SAHM = new Set(['4', '23']);
const TALENT_SAHM = new Set(['17', '18', '24', '25']);
function mapQuota(s) {
  s = String(s || '').trim();
  if (SHAHED_SAHM.has(s)) return 'SHAHED';
  if (STAFF_SAHM.has(s)) return 'STAFF';
  if (TALENT_SAHM.has(s)) return 'TOP_TALENT';
  return 'NORMAL';
}
const EXEMPT_MS = new Set(['3', '16', '17', '32']);
const PASSNG_MS = new Set(['12', '18', '23', '27', '40', '50', '53', '54']);
const FAILNG_MS = new Set(['2', '22', '51', '24']);
const TEMP_MS = new Set(['10', '13', '19']);
const DROP_MS = new Set(['4', '5', '6', '7', '8', '9', '14', '15', '20', '28', '29', '200', '201', '300', '931', '941', '951', '-91', '-1', '-3', '-4', '-5', '-6', '55', '52']);
const REG_DELETED = new Set(['2', '7', '-1', '-2', '16']); // LessonRegisterStatus.isDeleted (رزرو برای آینده)
function mapGrade(ms, mark) {
  ms = String(ms ?? '').trim();
  const hasMark = mark !== null && mark !== undefined && String(mark).trim() !== '' && !isNaN(Number(String(mark).trim()));
  const val = hasMark ? Number(String(mark).trim()) : null;
  const validVal = val !== null && val >= 0 && val <= 20 ? val : null;
  let gradeStatus;
  if (EXEMPT_MS.has(ms)) gradeStatus = 'EXEMPT';
  else if (validVal !== null) gradeStatus = TEMP_MS.has(ms) ? 'TEMPORARY' : 'FINALIZED';
  else if (PASSNG_MS.has(ms)) gradeStatus = 'PASSED_NO_GRADE';
  else if (FAILNG_MS.has(ms)) gradeStatus = 'FAILED_NO_GRADE';
  else if (TEMP_MS.has(ms)) gradeStatus = 'TEMPORARY';
  else gradeStatus = 'PENDING';
  const enroll = validVal !== null || !DROP_MS.has(ms);
  return { gradeStatus, gradeValue: validVal, enroll };
}

// ── کش‌ها ──
const degrees = new Map();      // SAMA-m -> id
const regulations = new Map();  // degreeId -> regId
const faculties = new Map();    // daneshkadehCode -> id
const majorsByCode = new Map(); // reshteCode -> {id, standardCode}
const termsByCode = new Map();  // termCode -> {id, startDate}
const coursesByCode = new Map();// lessonCode -> id
const studentsByCode = new Map(); // STNO -> {id, name}
let universityId = null;

async function ensureDegree(maghta) {
  const code = 'SAMA-' + String(maghta || '0');
  if (degrees.has(code)) return degrees.get(code);
  let row = (await q(`SELECT id FROM degree_level_configs WHERE code = $1`, [code]))[0];
  if (!row && !DRY) {
    row = (await q(`INSERT INTO degree_level_configs (title, code, "defaultPassingGrade", "conditionalGpaThreshold", "maxUnitsPerTerm")
      VALUES ($1,$2,10.00,12.00,20) ON CONFLICT (code) DO NOTHING RETURNING id`,
      [`مقطع سما ${maghta} (نیاز به تطبیق عنوان)`, code]))[0]
      || (await q(`SELECT id FROM degree_level_configs WHERE code = $1`, [code]))[0];
  }
  const id = row ? Number(row.id) : -1;
  degrees.set(code, id);
  return id;
}
// ── آیین‌نامه‌های تجمیعی (آینهٔ regulations-types.ts) ──
// نمرات در همه مقاطع یکسان است؛ فقط نیمسال/سنوات در levels می‌آید.
// ۶ ردیف نهایی: ۱۴۰۲، ۱۳۹۳، ۱۳۹۱، ۱۳۹۴ ارشد، ۱۳۹۴ دکتری، ماقبل ۱۳۹۱.
const REG_TITLES = {
  R1402: 'آیین‌نامه ۱۴۰۲ — کاردانی و کارشناسی',
  R1393: 'آیین‌نامه ۱۳۹۳',
  R1391: 'آیین‌نامه ۱۳۹۱',
  R1394MS: 'آیین‌نامه ۱۳۹۴ — کارشناسی ارشد',
  R1394PHD: 'آیین‌نامه ۱۳۹۴ — دکتری تخصصی',
  RPRE: 'آیین‌نامه ماقبل ۱۳۹۱',
};
const REG_KIND_1393 = new Set(['93', '94', '912', '914', '915']);
function regLevels(minUnits, shortProb, longProb, shortSem, longSem) {
  return {
    SHORT: { min_units: minUnits, max_consecutive_probations: shortProb, max_total_probations: shortProb, max_study_semesters: shortSem },
    LONG: { min_units: minUnits, max_consecutive_probations: longProb, max_total_probations: longProb, max_study_semesters: longSem },
  };
}
function regConfig(which) {
  const base = {
    source: 'SAMA-ETL', regulation: which,
    summer_term_rules: { default_max_units: 6, graduating_max_units: 8 },
    graduating_term_rules: { can_take_with_probation: true, max_units: 24, auto_corequisite_allowed: true },
  };
  if (which === '1394MS') return { ...base,
    regular_term_rules: { min_units: 8, max_units: 14, probation_max_units: 10, honors_min_gpa: 17.0, honors_max_units: 16 },
    probation_and_tenure: { probation_gpa_threshold: 14.0, max_consecutive_probations: 2, max_total_probations: 2, max_study_semesters: 4 },
    grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', default_passing_grade: 12.0 } };
  if (which === '1394PHD') return { ...base, graduating_term_rules: { can_take_with_probation: false, max_units: 12, auto_corequisite_allowed: false },
    regular_term_rules: { min_units: 6, max_units: 12, probation_max_units: 8, honors_min_gpa: 17.0, honors_max_units: 12 },
    probation_and_tenure: { probation_gpa_threshold: 16.0, max_consecutive_probations: 2, max_total_probations: 2, max_study_semesters: 8 },
    grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', default_passing_grade: 14.0 } };
  if (which === 'PRE1391') return { ...base,
    regular_term_rules: { min_units: 12, max_units: 20, probation_max_units: 14, honors_min_gpa: 17.0, honors_max_units: 24 },
    probation_and_tenure: { probation_gpa_threshold: 12.0, max_consecutive_probations: 3, max_total_probations: 3, max_study_semesters: 10 },
    grading_and_gpa: { failed_course_gpa_policy: 'KEEP_ALWAYS', default_passing_grade: 10.0 } };
  const minU = which === '1391' ? 14 : 12;
  const sem = which === '1391' ? [5, 10] : [4, 8];
  return { ...base,
    levels: regLevels(minU, 2, 3, sem[0], sem[1]),
    regular_term_rules: { min_units: minU, max_units: 20, probation_max_units: 14, honors_min_gpa: 17.0, honors_max_units: 24 },
    probation_and_tenure: { probation_gpa_threshold: 12.0, max_consecutive_probations: 3, max_total_probations: 3, max_study_semesters: sem[1] },
    grading_and_gpa: { failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', default_passing_grade: 10.0 } };
}
// فقط ردیف‌های مدیریتی ETL بازنویسی می‌شوند (خالی یا تگ SAMA-ETL) — دستی‌ها محفوظ
function shouldRefreshRegulation(rulesConfig) {
  if (!rulesConfig || rulesConfig === '{}') return true;
  try {
    const j = typeof rulesConfig === 'string' ? JSON.parse(rulesConfig) : rulesConfig;
    return j && j.source === 'SAMA-ETL';
  } catch { return false; }
}
// مقطع نماینده برای degreeLevelId ردیف تجمیعی (فقط لنگر FK؛ мотор گروه را از مدرک دانشجو می‌فهمد)
function repDegreeId(wantCodes) {
  for (const c of wantCodes) if (degrees.get(c)) return degrees.get(c);
  const first = [...degrees.values()][0];
  return first ?? -1;
}
async function ensureRegulation(degreeId, maghta, regKind) {
  const kind = String(regKind ?? '0').trim() || '0';
  const key = `${degreeId}|${kind}`;
  if (regulations.has(key)) return regulations.get(key);
  const m = String(maghta);
  let which, title, repId, effYear;
  if (m === '3') { which = '1394MS'; title = REG_TITLES.R1394MS; repId = repDegreeId(['SAMA-3']); effYear = 1394; }
  else if (['4', '6', '7', '8'].includes(m)) { which = '1394PHD'; title = REG_TITLES.R1394PHD; repId = repDegreeId(['SAMA-4', 'SAMA-6', 'SAMA-7', 'SAMA-8']); effYear = 1394; }
  else if (REG_KIND_1393.has(kind)) { which = '1393'; title = REG_TITLES.R1393; repId = repDegreeId(['SAMA-2']); effYear = 1393; }
  else { which = '1402'; title = REG_TITLES.R1402; repId = repDegreeId(['SAMA-2']); effYear = 1402; }
  if (repId < 0) repId = degreeId;
  const config = JSON.stringify(regConfig(which));
  let row = (await q(`SELECT id, "rulesConfig" FROM educational_regulations WHERE title = $1`, [title]))[0];
  if (!row && !DRY) {
    row = (await q(`INSERT INTO educational_regulations (title, "degreeLevelId", "effectiveFromYear", "rulesConfig")
      VALUES ($1,$2,$3,$4) RETURNING id`, [title, repId, effYear, config]))[0];
  } else if (row && !DRY && shouldRefreshRegulation(row.rulesConfig)) {
    await pool.query(`UPDATE educational_regulations SET "rulesConfig" = $2 WHERE id = $1`, [row.id, config]);
  }
  const id = row ? Number(row.id) : -1;
  regulations.set(key, id);
  return id;
}
async function ensureFaculty(code) {
  code = String(code ?? '').trim() || '0';
  if (faculties.has(code)) return faculties.get(code);
  let row = (await q(`SELECT id FROM faculties WHERE "facultyCode" = $1`, [code]))[0];
  if (!row && !DRY) {
    row = (await q(`INSERT INTO faculties (name, "facultyCode") VALUES ($1,$2) RETURNING id`, [`دانشکده ${code} (سما)`, code]))[0];
  }
  const id = row ? Number(row.id) : null;
  faculties.set(code, id);
  return id;
}

const deptByFacAndCode = new Map(); // `${facId}|${groupA}` -> deptId
async function ensureDepartment(facId, groupA, facultyCode) {
  const code = String(groupA ?? '').trim();
  if (!code || code === '0' || !facId) return null;
  const key = `${facId}|${code}`;
  if (deptByFacAndCode.has(key)) return deptByFacAndCode.get(key);
  // اگر همین دانشکده همین کد را دارد
  let row = (await q(`SELECT id FROM departments WHERE "facultyId" = $1 AND "departmentCode" = $2`, [facId, code]))[0];
  if (row) { deptByFacAndCode.set(key, Number(row.id)); return Number(row.id); }
  // اگر دانشکده دیگر همین کد را گرفته باشد — کد یکتاست، بدون کد بساز (مثل seed-base)
  const owner = (await q(`SELECT id FROM departments WHERE "departmentCode" = $1`, [code]))[0];
  if (owner) {
    // سعی: آیا گروه هم‌نام در همین دانشکده داریم؟
    row = (await q(`SELECT id FROM departments WHERE "facultyId" = $1 AND name = $2`, [facId, `گروه ${code}`]))[0];
    if (row) { deptByFacAndCode.set(key, Number(row.id)); return Number(row.id); }
    if (!DRY) {
      row = (await q(`INSERT INTO departments (name, "facultyId", "departmentCode") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [`گروه ${code}`, facId, `F${facultyCode}-${code}`]))[0]
        || (await q(`INSERT INTO departments (name, "facultyId") VALUES ($1,$2) RETURNING id`, [`گروه ${code}`, facId]))[0];
    }
    const id = row ? Number(row.id) : null;
    deptByFacAndCode.set(key, id);
    return id;
  }
  if (!DRY) {
    row = (await q(`INSERT INTO departments (name, "facultyId", "departmentCode") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [`گروه ${code}`, facId, code]))[0]
      || (await q(`SELECT id FROM departments WHERE "departmentCode" = $1`, [code]))[0];
  }
  const id = row ? Number(row.id) : null;
  deptByFacAndCode.set(key, id);
  return id;
}

async function logRun(entity, fileName, stats) {
  if (DRY) return;
  await q(`INSERT INTO migration_runs (entity, "fileName", mode, "totalRows", inserted, "skippedExisting", invalid, report, status, "triggeredByUserId")
    VALUES ($1,$2,'COMMIT',$3,$4,$5,$6,$7,$8,NULL)`,
    [entity, fileName, stats.total || 0, stats.inserted || 0, stats.existing || 0, stats.invalid || 0,
      JSON.stringify({ source: SOURCE, dry: false, ...stats }), stats.failed ? 'FAILED' : 'OK']);
}

// ═══ فازها ═══
async function phasePre() {
  console.log('\n── پیش‌نیازها ──');
  let u = (await q(`SELECT id, code, title FROM universities WHERE code = $1`, [SOURCE]))[0];
  if (!u && !DRY) {
    // خودترمیم: drizzle-kit push فقط اسکیما می‌سازد و INSERTهای seed مایگریشن 0005 را اجرا نمی‌کند —
    // پس ۵ دانشگاه مرجع را همین‌جا (idempotent) می‌سازیم
    console.log('دانشگاه‌ها در جدول universities نیست — seed مرجع اعمال می‌شود…');
    await q(`INSERT INTO universities (code, title, kind, status, province) VALUES
      ('AFAGH','دانشگاه آفاق','OWN','ACTIVE','آذربایجان غربی'),
      ('ZARINE','آموزشکده زرینه','DISSOLVED','ACTIVE','آذربایجان غربی'),
      ('ALLAME','آموزشکده علامه','DISSOLVED','ACTIVE','آذربایجان غربی'),
      ('SHAMS','موسسه شمس خوی','DISSOLVED','ACTIVE','آذربایجان غربی'),
      ('NAZHAND','موسسه نژند','DISSOLVED','ACTIVE','آذربایجان غربی')
      ON CONFLICT (code) DO NOTHING`);
    u = (await q(`SELECT id, code, title FROM universities WHERE code = $1`, [SOURCE]))[0];
  }
  if (!u) throw new Error(`دانشگاه ${SOURCE} در جدول universities نیست — اول مایگریشن 0005 را اعمال کنید`);
  universityId = u.id;
  console.log(`دانشگاه: ${SOURCE} (id=${universityId})`);
  if (!DRY) {
    await q(`INSERT INTO legacy_sources (code, title, kind, note) VALUES ($1,$2,'SAMA',$3)
      ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, kind = 'SAMA'`,
      [SOURCE, `سما — ${SOURCE}`, 'خروجی TSV سما (Windows-1256)']);
  }
  // نقشه‌های آماده
  const degRows = await q(`SELECT id, code FROM degree_level_configs`);
  for (const d of degRows) degrees.set(d.code, Number(d.id));
  const facRows = await q(`SELECT id, "facultyCode" FROM faculties`);
  for (const f of facRows) if (f.facultyCode) faculties.set(f.facultyCode, Number(f.id));
  const regRows = await q(`SELECT id, title, "degreeLevelId" FROM educational_regulations`);
  for (const r of regRows) {
    const m = String(r.title || '').match(/کد (\S+?)، مقطع/);
    const key = `${Number(r.degreeLevelId)}|${m ? m[1] : '0'}`;
    if (!regulations.has(key)) regulations.set(key, Number(r.id));
  }
  console.log(`کش: ${degrees.size} مقطع، ${faculties.size} دانشکده، ${regulations.size} آیین‌نامه`);
}

async function phaseTerms(file) {
  console.log('\n── ترم‌ها ──');
  const stats = { total: 0, inserted: 0, existing: 0, invalid: 0, maxNormal: '' };
  const batch = [];
  const flush = async () => {
    if (!batch.length || DRY) { batch.length = 0; return; }
    const vals = [];
    const ph = batch.map((r, i) => {
      const o = i * 7;
      vals.push(r.code, r.title, r.type, r.isCurrent, r.isSummer, r.start, r.end);
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO academic_terms ("termCode", title, "termType", "isCurrent", "isSummer", "startDate", "endDate")
      VALUES ${ph} ON CONFLICT ("termCode") DO NOTHING RETURNING id, "termCode"`, vals);
    for (const r of res.rows) { termsByCode.set(r.termCode, { id: r.id }); stats.inserted++; }
    stats.existing += batch.length - res.rows.length;
    batch.length = 0;
  };
  // اول کل کدها را بخوان تا جاری (بیشترین NORMAL) مشخص شود
  const codes = [];
  for await (const { cols } of tsvRows(file)) {
    const code = (cols[0] || '').trim();
    if (!/^\d{5}$/.test(code)) { stats.invalid++; continue; }
    codes.push({ code, type: (cols[14] || '').trim(), b: (cols[1] || '').trim(), e: (cols[2] || '').trim() });
    stats.total++;
  }
  const normals = codes.filter(c => c.type === '2').map(c => c.code).sort();
  stats.maxNormal = normals[normals.length - 1] || '';
  for (const c of codes) {
    const type = c.type === '3' ? 'SUMMER' : c.type === '2' ? 'NORMAL' : 'EQUIVALENCE';
    batch.push({
      code: c.code, title: `ترم ${c.code}`, type,
      isCurrent: c.code === stats.maxNormal ? 1 : 0,
      isSummer: c.type === '3' ? 1 : 0,
      start: faDate(c.b), end: faDate(c.e),
    });
    if (batch.length >= 200) await flush();
  }
  await flush();
  const rows = await q(`SELECT id, "termCode", "startDate" FROM academic_terms`);
  for (const r of rows) termsByCode.set(r.termCode, { id: r.id, startDate: r.startDate });
  console.log(`ترم‌ها: total=${stats.total} inserted=${stats.inserted} existing=${stats.existing} invalid=${stats.invalid} جاری=${stats.maxNormal}`);
  await logRun('term', 'semsters.txt (SAMA)', stats);
}

async function phaseMajors(file) {
  console.log('\n── رشته‌ها ──');
  const stats = { total: 0, inserted: 0, existing: 0, invalid: 0, unmatchedDegree: new Set() };
  const batch = [];
  const flush = async () => {
    if (!batch.length || DRY) { batch.length = 0; return; }
    const vals = [];
    const ph = batch.map((r, i) => {
      const o = i * 13;
      vals.push(r.name, r.degId, r.depId, r.code, r.facId, r.minUnits, r.std, r.est, r.term, r.active, r.head, r.expert, r.council);
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO majors (name, "degreeLevelId", "departmentId", "majorCode", "facultyId",
        "minUnits", "standardCode", "establishedDate", "terminatedDate", "isActive", "headStaffCode", "expertName", "lastCouncilDate")
      VALUES ${ph} ON CONFLICT ("majorCode") DO UPDATE SET
        "facultyId" = COALESCE(majors."facultyId", EXCLUDED."facultyId"),
        "departmentId" = COALESCE(majors."departmentId", EXCLUDED."departmentId"),
        name = CASE WHEN majors.name LIKE '%سما%' OR majors.name IS NULL OR majors.name = '' THEN EXCLUDED.name ELSE majors.name END
      RETURNING id`, vals);
    stats.inserted += res.rows.length;
    stats.existing += batch.length - res.rows.length;
    batch.length = 0;
  };
  for await (const { cols } of tsvRows(file)) {
    // Code Title Maghta Daneshkadeh GroupA MinUnit eTitle StandardCode AcceptanceMethodRef StartDate EndDate ...
    const code = (cols[0] || '').trim();
    const title = normTxt(cols[1]);
    if (!code || code === '0' || !title || title === 'نامشخص') { stats.invalid++; continue; }
    stats.total++;
    const degId = await ensureDegree((cols[2] || '').trim() || '0');
    const facId = await ensureFaculty((cols[3] || '').trim());
    const facCode = (cols[3] || '').trim() || '0';
    const groupA = (cols[4] || '').trim();
    const depId = await ensureDepartment(facId, groupA, facCode);
    batch.push({
      name: title.slice(0, 150), degId, depId, code: code.slice(0, 10), facId,
      minUnits: /^\d+$/.test((cols[5] || '').trim()) ? Number((cols[5] || '').trim()) : null,
      std: (cols[7] || '').trim().slice(0, 20) || null,
      est: (cols[9] || '').trim().slice(0, 10) || null,
      term: (cols[10] || '').trim().slice(0, 10) || null,
      active: (cols[11] || '').trim() === 'True' ? 1 : 0,
      head: (cols[23] || '').trim().slice(0, 20) || null,
      expert: normTxt(cols[24]).slice(0, 150) || null,
      council: null,
    });
    if (batch.length >= 200) await flush();
  }
  await flush();
  const rows = await q(`SELECT id, "majorCode", "standardCode" FROM majors`);
  for (const r of rows) if (r.majorCode) majorsByCode.set(String(r.majorCode), { id: r.id, standardCode: r.standardCode });
  console.log(`رشته‌ها: total=${stats.total} inserted=${stats.inserted} existing=${stats.existing} invalid=${stats.invalid} (majors در DB: ${majorsByCode.size})`);
  await logRun('major', 'reshtelist (SAMA)', stats);
}

async function phaseStudents(files, lookups) {
  if (!universityId) {
    const u = (await q(`SELECT id FROM universities WHERE code = $1`, [SOURCE]))[0];
    if (!u) throw new Error(`دانشگاه ${SOURCE} یافت نشد`);
    universityId = Number(u.id);
  }
  console.log('\n── دانشجویان (ادغام اصلی + تکمیلی) ──');
  // اگر majorsByCode خالی است (مثلاً مرحلهٔ students به‌تنهایی اجرا شده)، از DB پر کن
  if (!majorsByCode.size && !DRY) {
    const mRows = await q(`SELECT id, "majorCode", "standardCode" FROM majors`);
    for (const r of mRows) if (r.majorCode) majorsByCode.set(String(r.majorCode), { id: r.id, standardCode: r.standardCode });
    console.log(`رشته‌ها از DB بارگذاری شد: ${majorsByCode.size} رشته`);
  }
  // ۱) فایل اصلی
  const main = new Map();
  const stats = { total: 0, invalid: 0, badCode: 0, mergedSupp: 0, suppOrphans: 0, insertedUsers: 0, existingUsers: 0, insertedStudents: 0, existingStudents: 0, badNC: 0, ncChecksumWarn: 0, unmatchedMajor: new Set(), unknownMaghta: new Set(), unknownStatus: new Set(), idMin: null, idMax: null };
  for await (const { cols } of tsvRows(files.students)) {
    const stno = (cols[0] || '').trim();
    if (!/^\d{7,14}$/.test(stno)) { stats.badCode++; continue; }
    const name = normTxt(cols[2]);
    if (!name) { stats.invalid++; continue; }
    stats.total++;
    main.set(stno, cols);
  }
  console.log(`فایل اصلی: ${stats.total} ردیف معتبر (${stats.badCode} کد نامعتبر، ${stats.invalid} بدون نام)`);
  // ۱-ب) فایل دوم دانشجویی (students1.txt) → مرج: stno جدید اضافه، فیلد خالی با مقدار پر می‌شود
  // کلید هر دو فایل شماره دانشجویی (stno) است — نه کدملی
  if (files.studentsSubsetSkipped) {
    let n2 = 0, added2 = 0, filled2 = 0;
    for await (const { cols } of tsvRows(files.studentsSubsetSkipped)) {
      const stno = (cols[0] || '').trim();
      if (!/^\d{7,14}$/.test(stno)) continue;
      const name = normTxt(cols[2]);
      if (!name) continue;
      n2++;
      const m = main.get(stno);
      if (!m) { main.set(stno, cols); stats.total++; added2++; }
      else {
        for (let i = 0; i < cols.length; i++) {
          if (!(m[i] || '').trim() && (cols[i] || '').trim()) { m[i] = cols[i]; filled2++; }
        }
      }
    }
    console.log(`فایل دوم: ${n2} ردیف معتبر، ${added2} شماره جدید، ${filled2} فیلد خالی پر شد`);
  }
  // ۲) فایل تکمیلی → ادغام (فقط ۱۵ ستون اول قابل اعتماد است: قبل از Pic)
  if (files.supp) {
    let n = 0;
    for await (const { cols } of tsvRows(files.supp)) {
      const stno = (cols[0] || '').trim();
      if (!/^\d{7,14}$/.test(stno)) continue;
      n++;
      const m = main.get(stno);
      if (m) { m._supp = cols; stats.mergedSupp++; }
      else stats.suppOrphans++;
    }
    console.log(`تکمیلی: ${n} ردیف عددی، ${stats.mergedSupp} ادغام شد، ${stats.suppOrphans} بی‌همتا`);
  }
  // ۳) ساخت ردیف‌های users + students — هر کد ملی یک user، هر stno یک student (چند مقطعی پشتیبانی می‌شود)
  const userRows = [];
  const stuJobs = [];
  stats.dupNC = 0;
  for (const [stno, c] of main) {
    const s = c._supp || [];
    const rawName = normTxt(c[2]);
    const dash = rawName.lastIndexOf('-');
    const lastName = (dash > 0 ? rawName.slice(0, dash) : rawName).trim().slice(0, 100) || 'نامشخص';
    const firstName = (dash > 0 ? rawName.slice(dash + 1) : '').trim().slice(0, 100) || 'نامشخص';
    let nc = (s[7] || '').trim();
    if (!/^\d{10}$/.test(nc)) { nc = ''; stats.badNC++; }
    else if (checkNationalCode(nc) !== 'ok') stats.ncChecksumWarn++;
    const nationalCode = nc || ('S' + stno.padStart(9, '0')).slice(-10);
    // NOTE: we no longer dedup by nationalCode — a student can have multiple stnos (kardani → karshenasi)
    // User dedup is handled by ON CONFLICT ("nationalCode") DO NOTHING; student dedup by ON CONFLICT ("studentCode") DO NOTHING
    const sex = (c[3] || '').trim();
    const mobile = (s[35] || '').replace(/\D/g, '');
    const email = (s[13] || '').trim();
    const post = (s[11] || '').replace(/\D/g, '').slice(0, 10);
    const nat = (c[51] || '').trim();
    const isIr = (c[70] || '').trim();
    userRows.push({
      stno, nationalCode,
      firstName, lastName,
      mobile: /^\d{10,11}$/.test(mobile) ? mobile : null,
      email: email.includes('@') ? email.slice(0, 150) : null,
      birthCertNo: (c[12] || '').trim().slice(0, 20) || null,
      birthDate: faDate((c[19] || '').trim()),
      fatherName: normTxt(c[10]).slice(0, 100) || null,
      gender: sex === '1' ? 'MALE' : sex === '2' ? 'FEMALE' : null,
      address: (normTxt(c[28]) || normTxt(s[8])).slice(0, 300) || null,
      firstNameEn: ((c[91] || '').trim() || (c[57] || '').trim()).slice(0, 100) || null,
      lastNameEn: (c[92] || '').trim().slice(0, 100) || null,
      nationality: (nat === '1' || isIr === '1') ? '120001' : null,
      religion: (c[76] || '').trim().slice(0, 10) || null,
      postalCode: post || null,
      passportNumber: (s[20] || '').trim().slice(0, 20) || null,
      isAlive: (['6', '20'].includes((c[4] || '').trim())) ? 0 : 1,
    });
    // students job
    const maghta = (c[7] || '').trim() || '0';
    const reshte = (c[8] || '').trim();
    const status = (c[4] || '').trim();
    const regKind = (c[88] || '').trim() || '0';
    const tc = (c[5] || '').trim();
    let entryYear = 1400, entryTerm = 1;
    if (/^\d{5}$/.test(tc)) { entryYear = Number(tc.slice(0, 4)); entryTerm = Number(tc.slice(4)); }
    else {
      const sd = (c[37] || '').trim().match(/^(\d{4})\//);
      if (sd) entryYear = Number(sd[1]);
    }
    let avg = parseFloat((c[39] || '').trim());
    if (!(avg >= 0 && avg <= 20)) avg = null;
    const stop = (c[38] || '').trim();
    const faregh = (c[56] || '').trim();
    const sahmn = (c[40] || '').trim();
    const accept = (s[14] || '').trim();
    stuJobs.push({
      stno, maghta, reshte, status, entryYear, entryTerm, regKind,
      quota: mapQuota(sahmn),
      isaar: [...SHAHED_SAHM, ...STAFF_SAHM].some(x => x === sahmn) ? sahmn : null,
      alloc: lookups.sahmiye.get(sahmn) || null,
      acceptType: lookups.accept.get(accept) || null,
      studyingMode: (c[6] || '').trim().slice(0, 20) || null,
      trainingMethod: (c[78] || '').trim().slice(0, 20) || null,
      nativeType: (c[17] || '').trim().slice(0, 10) || null,
      ethnicity: (s[73] || '').trim().slice(0, 10) || null,
      totalAverage: avg,
      graduateDate: /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(stop) ? stop : null,
      eduEndYear: /^\d{5}$/.test(faregh) ? Number(faregh.slice(0, 4)) : null,
      eduEndSem: /^\d{5}$/.test(faregh) ? Number(faregh.slice(4)) : null,
      localField: reshte.slice(0, 20) || null,
    });
  }
  // ۴) درج users (bulk) — یک user به‌ازای هر کد ملی (چند stno می‌توانند یک user داشته باشند)
  const ncToId = new Map();
  const seenUserNC = new Set();
  const userRowsUnique = [];
  for (const u of userRows) { if (!seenUserNC.has(u.nationalCode)) { seenUserNC.add(u.nationalCode); userRowsUnique.push(u); } }
  stats.dupNC = userRows.length - userRowsUnique.length;
  for (let i = 0; i < userRowsUnique.length && !DRY; i += 500) {
    const ch = userRowsUnique.slice(i, i + 500);
    const vals = [];
    const ph = ch.map((r, j) => {
      const o = j * 18;
      vals.push(r.nationalCode, r.firstName, r.lastName, r.mobile, r.email, r.birthCertNo, r.birthDate,
        r.fatherName, r.gender, r.address, r.firstNameEn, r.lastNameEn, r.nationality, r.religion,
        r.postalCode, r.passportNumber, r.isAlive, 'MIGRATED:' + randomBytes(8).toString('hex'));
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13},$${o + 14},$${o + 15},$${o + 16},$${o + 17},$${o + 18},1,1)`;
    }).join(',');
    const res = await pool.query(`INSERT INTO users ("nationalCode","firstName","lastName",mobile,email,"birthCertNo","birthDate",
        "fatherName",gender,address,"firstNameEn","lastNameEn",nationality,religion,"postalCode","passportNumber","isAlive","passwordHash","isActive","mustChangePassword")
      VALUES ${ph} ON CONFLICT ("nationalCode") DO NOTHING RETURNING id, "nationalCode"`, vals);
    for (const r of res.rows) { ncToId.set(r.nationalCode, r.id); stats.insertedUsers++; if (stats.idMin === null || r.id < stats.idMin) stats.idMin = r.id; if (stats.idMax === null || r.id > stats.idMax) stats.idMax = r.id; }
    if (res.rows.length < ch.length) {
      const missing = ch.filter(r => !ncToId.has(r.nationalCode)).map(r => r.nationalCode);
      for (let k = 0; k < missing.length; k += 500) {
        const ex = await q(`SELECT id,"nationalCode" FROM users WHERE "nationalCode" = ANY($1)`, [missing.slice(k, k + 500)]);
        for (const r of ex) { ncToId.set(r.nationalCode, r.id); stats.existingUsers++; }
      }
    }
    if ((i / 500) % 20 === 0) console.log(`  users… ${Math.min(i + 500, userRowsUnique.length)}/${userRowsUnique.length} (یکتا؛ از ${userRows.length} ردیف stno)`);
  }
  // ۵) درج students (bulk)
  if (!DRY) {
    const userByStno = new Map(userRows.map(u => [u.stno, u]));
    const stuRows = [];
    for (const j of stuJobs) {
      const u = userByStno.get(j.stno);
      const userId = u && ncToId.get(u.nationalCode);
      if (!userId) { stats.invalid++; continue; }
      const degId = await ensureDegree(j.maghta);
      const regId = await ensureRegulation(degId, j.maghta, j.regKind);
      const mj = majorsByCode.get(j.reshte);
      if (!mj && j.reshte) stats.unmatchedMajor.add(j.reshte);
      stuRows.push({
        userId, stno: j.stno, majorId: mj ? mj.id : null, degId, regId,
        entryYear: j.entryYear, entryTerm: j.entryTerm, status: mapStudentStatus(j.status),
        quota: j.quota, universityId, totalAverage: j.totalAverage, graduateDate: j.graduateDate,
        nativeType: j.nativeType, ethnicity: j.ethnicity, alloc: j.alloc, acceptType: j.acceptType,
        isaar: j.isaar, studyingMode: j.studyingMode, trainingMethod: j.trainingMethod,
        eduEndYear: j.eduEndYear, eduEndSem: j.eduEndSem, localField: j.localField,
        fieldCode: mj && mj.standardCode ? mj.standardCode.slice(0, 20) : null,
      });
    }
    // NOTE: we no longer filter by userId — a person can have multiple student records (kardani → karshenasi)
    // Student dedup is handled by ON CONFLICT ("studentCode") DO NOTHING
    for (let i = 0; i < stuRows.length; i += 500) {
      const ch = stuRows.slice(i, i + 500);
      const vals = [];
      const ph = ch.map((r, j) => {
        const o = j * 23;
        vals.push(r.userId, r.stno, r.majorId, r.degId, r.regId, r.entryYear, r.entryTerm, r.status, r.quota,
          r.universityId, r.totalAverage, r.graduateDate, r.nativeType, r.ethnicity, r.alloc, r.acceptType,
          r.isaar, r.studyingMode, r.trainingMethod, r.eduEndYear, r.eduEndSem, r.localField, r.fieldCode);
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13},$${o + 14},$${o + 15},$${o + 16},$${o + 17},$${o + 18},$${o + 19},$${o + 20},$${o + 21},$${o + 22},$${o + 23})`;
      }).join(',');
      const res = await pool.query(`INSERT INTO students ("userId","studentCode","majorId","degreeLevelId","regulationId",
          "entryYear","entryTerm",status,"quotaType","universityId","totalAverage","graduateDate","nativeType",ethnicity,
          "acceptanceAllocation","acceptanceType","isaarCode","studyingMode","trainingMethod","eduEndYear","eduEndSemester","saminLocalFieldCode","saminFieldCode")
        VALUES ${ph} ON CONFLICT ("studentCode") DO NOTHING RETURNING id`, vals);
      stats.insertedStudents += res.rows.length;
      stats.existingStudents += ch.length - res.rows.length;
      if ((i / 500) % 20 === 0) console.log(`  students… ${Math.min(i + 500, stuRows.length)}/${stuRows.length}`);
    }
    const rows = await q(`SELECT id, "studentCode", "userId" FROM students WHERE "universityId" = $1`, [universityId]);
    for (const r of rows) studentsByCode.set(r.studentCode, { id: r.id, userId: r.userId });
    // فیکس دانشجویان موجود با majorId خالی — از روی saminLocalFieldCode مچ کن
    const fixRes = await q(`UPDATE students SET "majorId" = m.id
      FROM majors m WHERE students."majorId" IS NULL AND students."universityId" = $1
      AND students."saminLocalFieldCode" IS NOT NULL AND students."saminLocalFieldCode" != ''
      AND students."saminLocalFieldCode"::text = m."majorCode"::text`, [universityId]);
    if (fixRes.rowCount) console.log(`  majorId فیکس شد: ${fixRes.rowCount} دانشجو`);
  }
  stats.unmatchedMajor = [...stats.unmatchedMajor];
  stats.unknownMaghta = [...stats.unknownMaghta];
  console.log(`دانشجویان: users ins=${stats.insertedUsers} exist=${stats.existingUsers} | students ins=${stats.insertedStudents} exist=${stats.existingStudents} invalid=${stats.invalid} badNC=${stats.badNC} checksumWarn=${stats.ncChecksumWarn}`);
  console.log(`رشته‌های بی‌تطبیق: ${JSON.stringify(stats.unmatchedMajor)}`);
  await logRun('student', 'studentraw+supp (SAMA)', stats);
}

async function phaseGrades(files) {
  console.log('\n── نمرات (legacy خام + دروس + ارائه + ثبت‌نام) ──');
  const stats = { total: 0, legacyIns: 0, legacyDup: 0, enrollIns: 0, enrollSkip: 0, noStudent: 0, noTerm: 0, coursesNew: 0, offeringsNew: 0, badMark: 0 };
  if (!universityId) {
    const u = (await q(`SELECT id FROM universities WHERE code = $1`, [SOURCE]))[0];
    if (u) universityId = Number(u.id);
  }
  // نقشه‌های آماده
  if (!termsByCode.size && !DRY) {
    for (const r of await q(`SELECT id, "termCode", "startDate" FROM academic_terms`)) termsByCode.set(r.termCode, { id: Number(r.id), startDate: r.startDate });
  }
  if (!studentsByCode.size && !DRY) {
    const rows = await q(`SELECT s.id, s."studentCode", u."firstName", u."lastName" FROM students s JOIN users u ON u.id = s."userId" WHERE s."universityId" = $1`, [universityId]);
    for (const r of rows) studentsByCode.set(r.studentCode, { id: Number(r.id), name: `${r.lastName}-${r.firstName}` });
  }
  if (!coursesByCode.size && !DRY) {
    for (const r of await q(`SELECT id, code FROM courses`)) coursesByCode.set(r.code, Number(r.id));
  }
  const seenLegacy = new Set();
  const lessonCodes = new Set();
  const enrollJobs = [];
  const legacyBatch = [];
  const flushLegacy = async () => {
    if (!legacyBatch.length || DRY) { legacyBatch.length = 0; return; }
    const vals = [];
    const ph = legacyBatch.map((r, i) => {
      const o = i * 9;
      vals.push(SOURCE, r.stno, r.name, r.term, r.course, r.raw, r.val, r.status, r.rawJson);
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO legacy_grades ("sourceCode","studentCode","studentName","termCode","courseCode",
        "gradeRaw","gradeValue","gradeStatus","raw")
      VALUES ${ph} ON CONFLICT ("sourceCode","studentCode","termCode","courseCode") DO NOTHING`, vals);
    stats.legacyIns += res.rowCount;
    legacyBatch.length = 0;
  };
  let n = 0;
  for await (const { cols } of tsvRows(files.grades)) {
    // Stno TermCode LessonCode OldLessonCode LessonGroup Mark MarkStat SusCode Lastupdate ... TheoryMark OperativeMark DonMark DonMarkStat DonStatus DonCode ...
    const stno = (cols[0] || '').trim();
    const term = (cols[1] || '').trim();
    const course = (cols[2] || '').trim();
    if (!/^\d+$/.test(stno) || !/^\d{3,5}$/.test(term) || !course) { stats.total++; continue; }
    stats.total++; n++;
    const mark = (cols[5] || '').trim();
    const ms = (cols[6] || '').trim();
    const g = mapGrade(ms, mark);
    if (mark && g.gradeValue === null && !isNaN(Number(mark))) stats.badMark++;
    const key = `${stno}|${term}|${course}`;
    if (!seenLegacy.has(key)) {
      seenLegacy.add(key);
      lessonCodes.add(course);
      legacyBatch.push({
        stno, name: (studentsByCode.get(stno) || {}).name || null, term, course,
        raw: mark || null, val: g.gradeValue, status: g.gradeStatus,
        rawJson: JSON.stringify({ markStat: ms, susCode: (cols[7] || '').trim(), group: (cols[4] || '').trim(), theory: (cols[13] || '').trim(), operative: (cols[14] || '').trim(), donCode: (cols[18] || '').trim(), donStatus: (cols[17] || '').trim() }),
      });
      if (legacyBatch.length >= 1000) await flushLegacy();
    } else stats.legacyDup++;
    if (g.enroll) {
      enrollJobs.push({ stno, term, course, group: /^\d+$/.test((cols[4] || '').trim()) ? Number((cols[4] || '').trim()) : 1, val: g.gradeValue, status: g.gradeStatus });
    } else stats.enrollSkip++;
    if (n % 100000 === 0) console.log(`  grades… ${n}`);
    if (LIMIT && n >= LIMIT) break;
  }
  await flushLegacy();
  console.log(`legacy_grades: total=${stats.total} ins=${stats.legacyIns} dup=${stats.legacyDup} | enrollJobs=${enrollJobs.length} skip=${stats.enrollSkip}`);
  if (DRY) { await logRun('enrollment', 'grades (SAMA) DRY', stats); return; }
  // دروس placeholder
  const missingCourses = [...lessonCodes].filter(c => !coursesByCode.has(c));
  for (let i = 0; i < missingCourses.length; i += 500) {
    const ch = missingCourses.slice(i, i + 500);
    const vals = [];
    const ph = ch.map((c, j) => { vals.push(c, `درس مهاجرتی ${c}`); return `($${j * 2 + 1},$${j * 2 + 2},0,0,0)`; }).join(',');
    await pool.query(`INSERT INTO courses (code, title, "theoreticalUnits", "practicalUnits", units)
      VALUES ${ph} ON CONFLICT (code) DO NOTHING`, vals);
  }
  if (missingCourses.length) {
    for (const r of await q(`SELECT id, code FROM courses`)) coursesByCode.set(r.code, r.id);
  }
  stats.coursesNew = missingCourses.length;
  console.log(`دروس placeholder: ${stats.coursesNew} (کل دروس: ${coursesByCode.size})`);
  // ارائه‌ها (TRANSFER)
  const offKeys = new Map(); // `${termId}|${courseId}|${group}` -> {termId,courseId,group}
  for (const j of enrollJobs) {
    const t = termsByCode.get(j.term);
    const c = coursesByCode.get(j.course);
    if (!t) { stats.noTerm++; continue; }
    if (!c) continue;
    const k = `${t.id}|${c}|${j.group}`;
    if (!offKeys.has(k)) offKeys.set(k, { termId: t.id, courseId: c, group: j.group });
  }
  const offMap = new Map();
  const termIds = [...new Set([...offKeys.values()].map(o => o.termId))];
  for (let i = 0; i < termIds.length; i += 20) {
    const ex = await q(`SELECT id,"termId","courseId","groupNumber" FROM course_offerings WHERE "termId" = ANY($1)`, [termIds.slice(i, i + 20)]);
    for (const r of ex) offMap.set(`${r.termId}|${r.courseId}|${r.groupNumber}`, r.id);
  }
  const needOff = [...offKeys.values()].filter(o => !offMap.has(`${o.termId}|${o.courseId}|${o.group}`));
  for (let i = 0; i < needOff.length; i += 500) {
    const ch = needOff.slice(i, i + 500);
    const vals = [];
    const ph = ch.map((o, j) => { vals.push(o.termId, o.courseId, o.group); return `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3},999,0,'TRANSFER',1)`; }).join(',');
    const res = await pool.query(`INSERT INTO course_offerings ("termId","courseId","groupNumber",capacity,"enrolledCount","offeringType","isActive")
      VALUES ${ph} RETURNING id,"termId","courseId","groupNumber"`, vals);
    for (const r of res.rows) offMap.set(`${r.termId}|${r.courseId}|${r.groupNumber}`, r.id);
    stats.offeringsNew += res.rows.length;
  }
  console.log(`ارائه‌ها: distinct=${offKeys.size} new=${stats.offeringsNew} noTerm=${stats.noTerm}`);
  // ثبت‌نام‌ها (bulk)
  let done = 0;
  for (let i = 0; i < enrollJobs.length; i += 1000) {
    const ch = enrollJobs.slice(i, i + 1000);
    const vals = [];
    const rows = [];
    for (const j of ch) {
      const s = studentsByCode.get(j.stno);
      const t = termsByCode.get(j.term);
      if (!s) { stats.noStudent++; continue; }
      if (!t) continue;
      const offId = offMap.get(`${t.id}|${coursesByCode.get(j.course)}|${j.group}`);
      if (!offId) continue;
      rows.push({ s: s.id, o: offId, v: j.val, gs: j.status, at: t.startDate || new Date() });
    }
    if (!rows.length) continue;
    const ph = rows.map((r, k) => {
      const o = k * 6;
      vals.push(r.s, r.o, r.v, r.gs, r.v !== null ? 1 : 0, r.at);
      return `($${o + 1},$${o + 2},'REGISTERED',$${o + 3},$${o + 4},$${o + 5},$${o + 6})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO enrollments ("studentId","offeringId",status,"gradeValue","gradeStatus","hasEvaluated","registeredAt")
      VALUES ${ph} ON CONFLICT ("studentId","offeringId") DO NOTHING`, vals);
    stats.enrollIns += res.rowCount;
    done += ch.length;
    if ((i / 1000) % 50 === 0) console.log(`  enrollments… ${done}/${enrollJobs.length}`);
  }
  console.log(`ثبت‌نام‌ها: ins=${stats.enrollIns} noStudent=${stats.noStudent}`);
  await logRun('enrollment', 'grades (SAMA)', stats);
}

async function phaseCodemap(files) {
  console.log('\n── میز تطبیق کدها ──');
  const stats = { total: 0, inserted: 0 };
  const put = async (domain, code, title, targetCode, note, status = 'CONFIRMED') => {
    stats.total++;
    if (DRY) return;
    const safeTitle = title ? String(title).replace(/\x00/g, '').slice(0, 250) : null;
    const safeNote = note ? JSON.stringify(note).replace(/\\u0000/g, '').slice(0, 2000) : null;
    const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", "targetCode", note, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`,
      [SOURCE, domain, code, safeTitle, targetCode || null, safeNote, status]);
    stats.inserted += r.rowCount;
  };
  const readLookup = async (file, mapFn) => {
    if (!file) return;
    for await (const { cols } of tsvRows(file)) await mapFn(cols);
  };
  // وضعیت دانشجو
  await readLookup(files.status, async (c) => {
    const code = (c[0] || '').trim();
    if (!/^-?\d+$/.test(code)) return;
    await put('STUDENT_STATUS', code, normTxt(c[1]), mapStudentStatus(code),
      { ministry: (c[13] || '').trim(), standard: (c[5] || '').trim(), isGraduated: (c[10] || '').trim() });
  });
  // وضعیت نمره
  await readLookup(files.markstat, async (c) => {
    const code = (c[0] || '').trim();
    if (!/^-?\d+$/.test(code)) return;
    const g = mapGrade(code, code === '1' ? '15' : '');
    await put('GRADE_STATUS', code, normTxt(c[1]), g.gradeStatus,
      { avg: c[2], unit: c[3], assume: c[4], total: c[5], termAvg: c[19], termUnit: c[18] });
  });
  // سهمیه
  await readLookup(files.sahmiye, async (c) => {
    const code = (c[0] || '').trim();
    if (!/^-?\d+$/.test(code)) return;
    await put('QUOTA', code, normTxt(c[1]), mapQuota(code), { sanjesh: (c[3] || '').trim(), ministry: (c[6] || '').trim() });
  });
  // نحوه پذیرش
  await readLookup(files.accept, async (c) => {
    const code = (c[0] || '').trim();
    if (!/^-?\d+$/.test(code)) return;
    await put('ACCEPT_TYPE', code, normTxt(c[1]), (c[5] || '').trim() || null, { standard: (c[3] || '').trim() });
  });
  // وضعیت ثبت
  await readLookup(files.lessonreg, async (c) => {
    const code = (c[0] || '').trim();
    if (!/^-?\d+$/.test(code)) return;
    await put('LESSONREG', code, normTxt(c[1]), null, { effect: (c[2] || '').trim(), deleted: (c[6] || '').trim() });
  });
  // ── همهٔ فایل‌های مرجع باقی‌مانده با ستون Code/کد (مقطع، رتبه استاد، مدرک استاد،
  // وضع نمره، نوع درس، نوع دوره، نظام وظیفه، وضعیت نیمسال …) ──
  // هر فایلی که هدر Code/کد + Title/عنوان داشته باشد ولی در detectFiles جدا نشده بود،
  // اینجا به‌صورت generic معادل می‌شود (هدر فارسی و انگلیسی هر دو پشتیبانی می‌شود)
  {
    const handled = new Set([files.status, files.markstat, files.sahmiye, files.accept, files.lessonreg].filter(Boolean));
    const skipData = new Set([files.students, files.grades, files.supp, files.terms, files.majors, files.profs, files.schedule, files.curriculum, files.stterm, files.studentsSubsetSkipped, files.tatbigh, files.tatbighMap, files.groups, files.degrees].filter(Boolean));
    const isCodeCol = (c) => { const t = String(c || '').trim(); return t === 'Code' || t === 'کد' || t === 'كد'; };
    const isTitleCol = (c) => /Title/i.test(String(c || '')) || String(c || '').trim() === 'عنوان';
    let allTxt = [];
    try { allTxt = readdirSync(DIR).filter(n => /\.txt$/i.test(n)).map(n => join(DIR, n)); } catch {}
    for (const p of allTxt) {
      if (handled.has(p) || skipData.has(p)) continue;
      // فایل‌های چندمگابایتی (رکورد عملیاتی/باینری عکس) مرجع نیستند — فقط لوکاپ‌های کوچک
      try { if (statSync(p).size > 5 * 1024 * 1024) continue; } catch { continue; }
      let h = [];
      try { h = await readHeaderOnly(p); } catch { continue; }
      const codeIdx = h.findIndex(isCodeCol);
      const titleIdx = h.findIndex(isTitleCol);
      if (codeIdx < 0 || titleIdx < 0) continue;
      const base = p.split(/[\\/]/).pop().replace(/\.txt$/i, '').trim();
      // نرمال‌سازی ي/ك عربی و ة تا match کلیدواژه‌ها مقاوم به املا باشد
      const lower = base.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه');
      let domain, noteFn = null;
      if (lower.includes('وضع نمره')) {
        // فایل مرجع وضعیت نمره (هدر فارسی): کدها با markstat هم‌پوشانی دارند؛
        // با ON CONFLICT DO NOTHING فقط کدهای جدید اضافه و پرچم‌ها در note ذخیره می‌شود
        domain = 'GRADE_STATUS';
        noteFn = (c) => ({ file: base, avgEffect: (c[2] || '').trim(), unitEffect: (c[3] || '').trim(), passed: (c[4] || '').trim(), totalEffect: (c[5] || '').trim(), latin: normTxt(c[7]) || null });
      }
      else if (lower.includes('مدرک')) {
        domain = 'PROF_DEGREE';
        noteFn = (c) => ({ file: base, latin: normTxt(c[2]) || null, standard: (c[3] || '').trim() || null, isPhd: (c[4] || '').trim() || null });
      }
      else if (lower.includes('رتبه')) domain = 'PROF_RANK';
      else if (lower.includes('مقطع')) domain = 'DEGREE_LEVEL';
      else if (lower.includes('نوع درس')) domain = 'COURSE_TYPE';
      else if (lower.includes('نوع دوره')) domain = 'PERIOD_TYPE';
      else if (lower.includes('نظام وظیفه') || lower.includes('وظیفه')) domain = 'MILITARY_STATUS';
      else if (lower.includes('نحوه') || lower.includes('پذیرش') || lower.includes('ورود')) domain = 'ACCEPT_TYPE';
      else if (lower.includes('وضعیت نیمسال') && !lower.includes('دانشجو')) domain = 'TERM_STATUS';
      else if (lower.includes('وضعیت دانشجو') || lower.includes('وضعيت دانشجو')) domain = 'STUDENT_STATUS';
      else {
        domain = base.replace(/\s+/g, '_').toUpperCase().replace(/[^A-Z0-9_\u0600-\u06FF]/g, '_').replace(/_+/g, '_').slice(0, 40);
        if (!/^[A-Z_]/.test(domain)) domain = 'LOOKUP_' + domain;
      }
      // اگر دامنه از قبل به‌صورت explicit هندل شده، رد کن تا دوباره‌کاری نشود
      if (['STUDENT_STATUS','GRADE_STATUS','QUOTA','ACCEPT_TYPE','LESSONREG'].includes(domain) && handled.has(p)) continue;
      const stdIdx = h.findIndex(c => /StandardCode/i.test(c) || String(c || '').trim() === 'کد استاندارد');
      let cnt = 0;
      await readLookup(p, async (c) => {
        const code = (c[codeIdx] || '').trim();
        if (!/^-?\d+$/.test(code)) return;
        const title = normTxt(c[titleIdx]);
        if (!title || title === 'نامشخص') return;
        const std = stdIdx >= 0 ? (c[stdIdx] || '').trim() || null : null;
        await put(domain, code, title, std, noteFn ? noteFn(c) : { file: base });
        cnt++;
      });
      if (cnt) console.log(`  + ${domain} ← ${base}: ${cnt} کد`);
    }
  }
  // رشته/مقطع/ترم → id
  if (!DRY) {
    for (const [code, m] of majorsByCode) {
      stats.total++;
      const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "targetId", status)
        VALUES ($1,'MAJOR',$2,$3,'CONFIRMED') ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`, [SOURCE, code, m.id]);
      stats.inserted += r.rowCount;
    }
    for (const [code, id] of degrees) {
      if (!code.startsWith('SAMA-')) continue;
      stats.total++;
      const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "targetId", status)
        VALUES ($1,'DEGREE',$2,$3,'CONFIRMED') ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`, [SOURCE, code.slice(5), id]);
      stats.inserted += r.rowCount;
    }
    // نگاشت (مقطع، RegulationKind) → آیین‌نامه در میز تطبیق
    for (const [key, id] of regulations) {
      const [degId, kind] = String(key).split('|');
      if (kind === undefined || kind === '0') continue;
      stats.total++;
      const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "targetId", note, status)
        VALUES ($1,'REGULATION',$2,$3,$4,'CONFIRMED') ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`,
        [SOURCE, `${degId}:${kind}`, id, JSON.stringify({ degreeLevelId: Number(degId), regulationKind: kind })]);
      stats.inserted += r.rowCount;
    }
    // ── اعمال واقعی عنوان مقطع‌ها از مقطعها.txt روی degree_level_configs ──
    // (فقط ردیف‌های placeholder «مقطع سما…» تا عنوان‌های اصلاح‌شده دستی نپرد)
    if (files.degrees) {
      let titleUpd = 0;
      for await (const { cols } of tsvRows(files.degrees)) {
        const code = (cols[0] || '').trim();
        const title = normTxt(cols[1]);
        if (!/^\d+$/.test(code) || !title || title === 'نامشخص') continue;
        const passMark = parseFloat((cols[2] || '').trim());
        const r = await pool.query(`UPDATE degree_level_configs
          SET title = $2${Number.isFinite(passMark) ? `, "defaultPassingGrade" = $3` : ''}
          WHERE code = $1 AND title LIKE 'مقطع سما%'`,
          Number.isFinite(passMark) ? [`SAMA-${code}`, title.slice(0, 100), passMark] : [`SAMA-${code}`, title.slice(0, 100)]);
        titleUpd += r.rowCount;
      }
      // کش حافظه را هم همگام کن تا ادامهٔ همین اجرا عنوان تازه ببیند
      for (const r of await q(`SELECT id, code FROM degree_level_configs`)) degrees.set(r.code, Number(r.id));
      console.log(`  عنوان مقطع‌ها به‌روز شد: ${titleUpd} ردیف`);
    }
    for (const [code, t] of termsByCode) {
      stats.total++;
      const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "targetId", status)
        VALUES ($1,'TERM',$2,$3,'CONFIRMED') ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`, [SOURCE, code, t.id]);
      stats.inserted += r.rowCount;
    }
  }
  console.log(`codemap: total=${stats.total} inserted=${stats.inserted}`);
  await logRun('codemap', 'lookups (SAMA)', stats);
}

async function phaseGroups(file) {
  console.log('\n── گروه‌های آموزشی (گروههای آموزشی.txt) ──');
  const stats = { total: 0, inserted: 0, existing: 0, invalid: 0, facNew: 0 };
  // حذف گروه‌های بی‌کدِ خالی قبل از درج (به درخواست: حذف کن) — FKها اول آزاد شوند
  if (!DRY) {
    const toDel = (await q(`SELECT id FROM departments WHERE "departmentCode" IS NULL AND name ~ '^\\s*\\d+\\s*$'`)).map(r=>r.id);
    if (toDel.length){
      await pool.query(`UPDATE staff SET "departmentId"=NULL WHERE "departmentId"=ANY($1)`,[toDel]);
      await pool.query(`UPDATE courses SET "departmentId"=NULL WHERE "departmentId"=ANY($1)`,[toDel]);
      await pool.query(`UPDATE majors SET "departmentId"=NULL WHERE "departmentId"=ANY($1)`,[toDel]);
      const del = (await pool.query(`DELETE FROM departments WHERE id=ANY($1)`,[toDel])).rowCount;
      if (del) console.log(`  حذف گروه‌های عددی بی‌کد: ${del}`);
    }
  }
  for await (const { cols } of tsvRows(file)) {
    const code = (cols[0] || '').trim();
    const name = normTxt(cols[1]);
    if (!/^\d+$/.test(code) || !name || name === 'نامشخص') { stats.invalid++; continue; }
    stats.total++;
    const place = (cols[3] || '').trim() || '0';
    const facId = await ensureFaculty(place);
    if (!facId) { stats.invalid++; continue; }
    const facCode = place;
    // جستجو با کد جهانی
    let row = (await q(`SELECT id, name FROM departments WHERE "departmentCode"=$1`, [code]))[0];
    if (row) {
      stats.existing++;
      // اگر نام فرق دارد، به‌روز کن (فقط اگر placeholder بود)
      if (normTxt(row.name) !== name && row.name.startsWith('گروه ')) {
        if (!DRY) await pool.query(`UPDATE departments SET name=$2 WHERE id=$1`, [row.id, name.slice(0,150)]);
      }
      deptByFacAndCode.set(`${facId}|${code}`, Number(row.id));
      deptByFacAndCode.set(`CODE:${code}`, Number(row.id));
      deptByFacAndCode.set(`NAME:${name}`, Number(row.id));
      continue;
    }
    // دانشکده-کد تکراری نیست → بساز
    if (!DRY) {
      row = (await q(`INSERT INTO departments (name, "facultyId", "departmentCode", kind, "isActive") VALUES ($1,$2,$3,'ACADEMIC',1) ON CONFLICT DO NOTHING RETURNING id`, [name.slice(0,150), facId, code]))[0]
        || (await q(`SELECT id FROM departments WHERE "departmentCode"=$1`, [code]))[0];
      if (row) { stats.inserted++; deptByFacAndCode.set(`${facId}|${code}`, Number(row.id)); deptByFacAndCode.set(`CODE:${code}`, Number(row.id)); deptByFacAndCode.set(`NAME:${name}`, Number(row.id)); }
    } else stats.inserted++;
  }
  console.log(`گروه‌ها: total=${stats.total} inserted=${stats.inserted} existing=${stats.existing} invalid=${stats.invalid}`);
  await logRun('department', 'گروههای آموزشی.txt', stats);
}

async function phaseCourseGroupLink(file) {
  console.log('\n── تطبیق دروس→گروه (تطبيق کد دروس.txt) ──');
  const stats = { total: 0, linked: 0, noDept: 0, noCourse: new Set(), badGroup: new Set() };
  // کش کد گروه→deptId
  if (![...deptByFacAndCode.keys()].some(k=>k.startsWith('CODE:'))) {
    for (const r of await q(`SELECT id, "departmentCode" FROM departments WHERE "departmentCode" IS NOT NULL`)) deptByFacAndCode.set(`CODE:${r.departmentCode}`, Number(r.id));
  }
  const updates = []; // {code, deptId}
  for await (const { cols } of tsvRows(file)) {
    const code = (cols[0] || '').trim();
    const groupA = (cols[7] || '').trim();
    if (!/^\d+$/.test(code) || !/^\d+$/.test(groupA) || groupA==='0') continue;
    stats.total++;
    const deptId = deptByFacAndCode.get(`CODE:${groupA}`);
    if (!deptId) { stats.badGroup.add(groupA); continue; }
    updates.push({ code, deptId });
  }
  // بالک آپدیت
  let done=0;
  for (let i=0;i<updates.length && !DRY;i+=500){
    const ch=updates.slice(i,i+500);
    const vals=[]; const cases=[];
    for(let j=0;j<ch.length;j++){ vals.push(ch[j].code, ch[j].deptId); cases.push(`WHEN $${j*2+1} THEN $${j*2+2}::int`); }
    const codes=ch.map(c=>c.code);
    const res=await pool.query(`UPDATE courses SET "departmentId" = CASE code ${cases.join(' ')} END WHERE code = ANY($${vals.length+1}::varchar[]) AND ("departmentId" IS NULL OR "departmentId" != CASE code ${cases.join(' ')} END)`, [...vals, codes]);
    stats.linked+=res.rowCount; done+=ch.length;
    if(done%2000===0) console.log(`  link… ${done}/${updates.length}`);
  }
  if (DRY) stats.linked=updates.length;
  console.log(`تطبیق: total=${stats.total} linked=${stats.linked} noDept=${stats.badGroup.size}`);
  if(stats.badGroup.size) console.log(`  گروه‌های بی‌تطبیق: ${[...stats.badGroup].slice(0,10).join('، ')}`);
  await logRun('course_dept_link', 'تطبيق کد دروس.txt', stats);
}

async function phaseStterm(files, file) {
  console.log('\n── وضعیت نیمسال دانشجویان ──');
  const stats = { total: 0, upserted: 0, noStudent: 0, noTerm: 0, invalid: 0 };
  if (!DRY) {
    await pool.query(`CREATE TABLE IF NOT EXISTS student_term_states (
      id SERIAL PRIMARY KEY, "studentId" INTEGER NOT NULL REFERENCES students(id),
      "termId" INTEGER NOT NULL REFERENCES academic_terms(id),
      "termCode" VARCHAR(10) NOT NULL, "statusCode" VARCHAR(10),
      "statusTitle" VARCHAR(150), "isProbation" INTEGER,
      "termAvg" NUMERIC(4,2),
      CONSTRAINT uq_student_term_states UNIQUE ("studentId","termId"))`);
  }
  // مرجع عنوان وضعیت‌ها
  const titleByCode = new Map();
  if (files.termstatus) {
    for await (const { cols } of tsvRows(files.termstatus)) {
      const code = (cols[0] || '').trim();
      const title = normTxt(cols[1]);
      if (/^\d+$/.test(code) && title && !titleByCode.has(code)) titleByCode.set(code, title.slice(0, 150));
    }
    console.log(`  مرجع وضعیت نیمسال: ${titleByCode.size} کد`);
  }
  // نقشه‌های دانشجو/ترم
  if (!studentsByCode.size && !DRY) {
    const rows = await q(`SELECT id, "studentCode" FROM students WHERE "universityId" = $1`, [universityId]);
    for (const r of rows) studentsByCode.set(r.studentCode, { id: Number(r.id) });
  }
  if (!termsByCode.size && !DRY) {
    for (const r of await q(`SELECT id, "termCode" FROM academic_terms`)) termsByCode.set(r.termCode, { id: Number(r.id) });
  }
  const parseProb = (s) => {
    const t = String(s || '').trim().toLowerCase();
    if (t === 'true' || t === '1') return 1;
    if (t === 'false' || t === '0') return 0;
    return null;
  };
  const batch = [];
  const flush = async () => {
    if (!batch.length || DRY) { batch.length = 0; return; }
    const vals = [];
    const ph = batch.map((r, i) => {
      const o = i * 7;
      vals.push(r.s, r.t, r.tc, r.sc, r.st, r.pb, r.avg);
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO student_term_states ("studentId","termId","termCode","statusCode","statusTitle","isProbation","termAvg")
      VALUES ${ph} ON CONFLICT ("studentId","termId") DO UPDATE SET
        "statusCode" = COALESCE(EXCLUDED."statusCode", student_term_states."statusCode"),
        "statusTitle" = COALESCE(EXCLUDED."statusTitle", student_term_states."statusTitle"),
        "isProbation" = COALESCE(EXCLUDED."isProbation", student_term_states."isProbation"),
        "termAvg" = COALESCE(EXCLUDED."termAvg", student_term_states."termAvg")`, vals);
    stats.upserted += res.rowCount;
    batch.length = 0;
  };
  let n = 0;
  for await (const { cols } of tsvRows(file)) {
    // TermCode Stno StTermStatus SusStatus TermAvg ... Mashroot ... CurrentMaghta
    const stno = (cols[1] || '').trim();
    const term = (cols[0] || '').trim();
    if (!/^\d+$/.test(stno) || !/^\d{3,5}$/.test(term)) { stats.invalid++; continue; }
    stats.total++; n++;
    const s = studentsByCode.get(stno);
    const t = termsByCode.get(term);
    if (!s) { stats.noStudent++; continue; }
    if (!t) { stats.noTerm++; continue; }
    const sc = (cols[2] || '').trim() || null;
    const avgRaw = parseFloat((cols[4] || '').trim());
    batch.push({
      s: s.id, t: t.id, tc: term, sc,
      st: (sc && titleByCode.get(sc)) || null,
      pb: parseProb(cols[8]),
      avg: Number.isFinite(avgRaw) && avgRaw >= 0 && avgRaw <= 20 ? avgRaw : null,
    });
    if (batch.length >= 1000) await flush();
    if (n % 100000 === 0) console.log(`  stterm… ${n}`);
    if (LIMIT && n >= LIMIT) break;
  }
  await flush();
  console.log(`وضعیت نیمسال: total=${stats.total} upserted=${stats.upserted} noStudent=${stats.noStudent} noTerm=${stats.noTerm} invalid=${stats.invalid}`);
  await logRun('termstate', 'وضعيت نيمسال دانشجويان.txt (SAMA)', stats);
}

async function phaseTatbigh(file) {
  console.log('\n── دروس (تطبیق — tatbigh dars.txt) ──');
  const stats = { total: 0, inserted: 0, updated: 0, invalid: 0, linked: 0, unlinkedGroup: new Set() };
  // کش گروه→departmentId (نام دقیق گروه آموزشی)
  if (!deptByFacAndCode.size) {
    // پرکردن کش از DB برای تطبیق نامی
    for (const r of await q(`SELECT id, name, "departmentCode" FROM departments`)) {
      const n = normTxt(r.name);
      if (n) deptByFacAndCode.set(`NAME:${n}`, Number(r.id));
      if (r.departmentCode) deptByFacAndCode.set(`CODE:${r.departmentCode}`, Number(r.id));
    }
  }
  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    if (DRY) { batch.length = 0; return; }
    const vals = [];
    const ph = batch.map((r, i) => {
      const o = i * 7;
      vals.push(r.code, r.title, r.theory, r.practical, r.units, r.type, r.deptId);
      return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO courses (code, title, "theoreticalUnits", "practicalUnits", units, "courseType", "departmentId")
      VALUES ${ph}
      ON CONFLICT (code) DO UPDATE SET
        title = EXCLUDED.title,
        "theoreticalUnits" = EXCLUDED."theoreticalUnits",
        "practicalUnits" = EXCLUDED."practicalUnits",
        units = EXCLUDED.units,
        "courseType" = COALESCE(EXCLUDED."courseType", courses."courseType"),
        "departmentId" = COALESCE(courses."departmentId", EXCLUDED."departmentId")
      RETURNING xmax = 0 AS inserted`, vals);
    // xmax=0 means inserted, else updated — but simpler: count via rowCount and assume
    stats.inserted += res.rowCount;
    // updated = those where title changed from placeholder
    batch.length = 0;
  };
  // also collect equivalencies for legacy_code_maps as COURSE_EQUIV
  const equivJobs = [];
  for await (const { cols } of tsvRows(file)) {
    const code = (cols[0] || '').trim();
    const title = normTxt(cols[1]);
    if (!/^\d+$/.test(code) || !title || title === 'نامشخص' || code === '0') { stats.invalid++; continue; }
    const units = parseFloat((cols[4] || '0').trim()) || 0;
    const theory = parseFloat((cols[5] || '0').trim()) || 0;
    const practical = parseFloat((cols[6] || '0').trim()) || 0;
    const courseType = normTxt(cols[7]).slice(0, 50) || null;
    const groupName = normTxt(cols[3]);
    let deptId = null;
    if (groupName && groupName !== 'نامشخص') {
      // تطبیق دقیق با نام گروه — اگر دو گروه هم‌نام در دو دانشکده باشد، نام‌باید با کد تمایز یابد و تطبیق نامی خطاست
      const hit = deptByFacAndCode.get(`NAME:${groupName}`);
      if (hit) { deptId = hit; stats.linked++; }
      else { stats.unlinkedGroup.add(groupName); }
    }
    const equivRaw = (cols[14] || '').trim();
    if (equivRaw) equivJobs.push({ code, equivRaw });
    stats.total++;
    batch.push({ code: code.slice(0,20), title: title.slice(0,150), theory, practical, units, type: courseType, deptId });
    coursesByCode.set(code, -1); // mark as known for later placeholder avoidance
    if (batch.length >= 500) await flush();
  }
  await flush();
  // refresh coursesByCode
  for (const r of await q(`SELECT id, code FROM courses`)) coursesByCode.set(r.code, Number(r.id));
  console.log(`دروس: total=${stats.total} upserted=${stats.inserted} invalid=${stats.invalid} linked=${stats.linked} (courses در DB: ${coursesByCode.size})`);
  if (stats.unlinkedGroup.size) console.log(`  گروه‌های بی‌تطبیق tatbigh: ${[...stats.unlinkedGroup].slice(0,10).join('، ')}`);
  // هم‌ارزی‌ها را به legacy_code_maps بریز (برای گزارش و تطبیق آینده)
  if (equivJobs.length && !DRY) {
    let eqIns = 0;
    for (const j of equivJobs) {
      const parts = j.equivRaw.split(/[,&|]+/).map(s=>s.trim()).filter(s=>/^\d+$/.test(s));
      for (const eq of parts) {
        try {
          const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", "targetCode", status)
            VALUES ($1,'COURSE_EQUIV',$2,$3,$4,'CONFIRMED') ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`,
            [SOURCE, j.code, `هم‌ارز ${eq}`, eq]);
          eqIns += r.rowCount;
        } catch {}
      }
    }
    if (eqIns) console.log(`  هم‌ارزی دروس: ${eqIns} رکورد`);
  }
  await logRun('course', 'tatbigh dars.txt (SAMA)', stats);
}

// ═══ اجرا ═══
try {
  console.log(`SAMA→Afagh ETL | source=${SOURCE} | dir=${DIR} | steps=${STEPS.join(',')} | limit=${LIMIT || '∞'} | ${DRY ? 'DRY-RUN' : 'LIVE'}`);
  const files = await detectFiles(DIR);
  console.log('فایل‌ها:', Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? v.split('\\').pop() : v])));
  if (files.studentsSubsetSkipped) console.log(`(زیرمجموعه نادیده گرفته شد: ${files.studentsSubsetSkipped.split('\\').pop()})`);
  for (const s of ['pre', 'terms', 'majors', 'groups', 'courses', 'links', 'students', 'grades', 'stterm', 'codemap']) {
    if (!STEPS.includes(s)) continue;
    if (s === 'pre') await phasePre();
    if (s === 'terms') { if (!files.terms) throw new Error('فایل ترم‌ها پیدا نشد'); await phaseTerms(files.terms); }
    if (s === 'majors') { if (!files.majors) throw new Error('فایل رشته‌ها پیدا نشد'); await phaseMajors(files.majors); }
    if (s === 'groups') {
      if (files.groups) await phaseGroups(files.groups);
      else console.log('\n── گروه‌های آموزشی: فایل گروههای آموزشی.txt یافت نشد — رد شد');
    }
    if (s === 'courses') {
      if (files.tatbigh) await phaseTatbigh(files.tatbigh);
      else console.log('\n── دروس: فایل tatbigh dars.txt یافت نشد — از روی placeholder ادامه داده می‌شود');
    }
    if (s === 'links') {
      if (files.tatbighMap) await phaseCourseGroupLink(files.tatbighMap);
      else console.log('\n── تطبیق دروس→گروه: فایل تطبيق کد دروس.txt یافت نشد — رد شد');
    }
    if (s === 'students') {
      if (!files.students) throw new Error('فایل دانشجویان پیدا نشد');
      // lookups پذیرش/سهمیه برای همان مرحله
      const lookups = { sahmiye: new Map(), accept: new Map() };
      if (files.sahmiye) for await (const { cols } of tsvRows(files.sahmiye)) {
        if (/^-?\d+$/.test((cols[0] || '').trim())) lookups.sahmiye.set((cols[0] || '').trim(), (cols[3] || '').trim() || null);
      }
      // نحوه ورود: عنوان ستون Title (نه کد وزارت) تا مستقیم در کارنامه بنشیند
      if (files.accept) for await (const { cols } of tsvRows(files.accept)) {
        if (/^-?\d+$/.test((cols[0] || '').trim())) lookups.accept.set((cols[0] || '').trim(), normTxt(cols[1]).slice(0, 30) || null);
      }
      await phaseStudents(files, lookups);
    }
    if (s === 'grades') { if (!files.grades) throw new Error('فایل نمرات پیدا نشد'); await phaseGrades(files); }
    if (s === 'stterm') {
      if (files.stterm) await phaseStterm(files, files.stterm);
      else console.log('\n── وضعیت نیمسال: فایل وضعيت نيمسال دانشجويان.txt یافت نشد — رد شد');
    }
    if (s === 'codemap') await phaseCodemap(files);
  }
  console.log('\n🎉 کامل شد.');
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  await pool.end();
}

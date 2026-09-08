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
const STEPS = (args.steps || 'pre,terms,majors,courses,students,grades,codemap').split(',').map(s => s.trim());
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
const normTxt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

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
    else if (has('IncludedTuition')) found.lessonreg = p;
    else if (has('applicantIsActive')) found.accept = p;
    else if (has('SanjeshCode')) found.sahmiye = p;
    else if (h.join(" ").replace(/\u200c/g, "").includes("تغيير رشته") || h.join(" ").includes("فارغ التحصيل")) found.status = p;
    else if (has('كد','نام') && has('مقطع','گروه_اموزشي') && has('تعداد_واحد')) found.tatbigh = p;
  }
  if (cands.students.length) {
    cands.students.sort((a, b) => b.size - a.size);
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
async function ensureRegulation(degreeId, maghta) {
  if (regulations.has(degreeId)) return regulations.get(degreeId);
  let row = (await q(`SELECT id FROM educational_regulations WHERE "degreeLevelId" = $1 ORDER BY id LIMIT 1`, [degreeId]))[0];
  if (!row && !DRY) {
    row = (await q(`INSERT INTO educational_regulations (title, "degreeLevelId", "effectiveFromYear", "rulesConfig")
      VALUES ($1,$2,1330,'{}') RETURNING id`, [`آیین‌نامه مهاجرتی سما (مقطع ${maghta})`, degreeId]))[0];
  }
  const id = row ? Number(row.id) : -1;
  regulations.set(Number(degreeId), id);
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
  const regRows = await q(`SELECT id, "degreeLevelId" FROM educational_regulations`);
  for (const r of regRows) if (!regulations.has(Number(r.degreeLevelId))) regulations.set(Number(r.degreeLevelId), Number(r.id));
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
      VALUES ${ph} ON CONFLICT ("majorCode") DO NOTHING RETURNING id`, vals);
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
    batch.push({
      name: title.slice(0, 150), degId, depId: null, code: code.slice(0, 10), facId,
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
  for (const r of rows) if (r.majorCode) majorsByCode.set(r.majorCode, { id: r.id, standardCode: r.standardCode });
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
  // ۳) ساخت ردیف‌های users + students (حذف تکرار کد ملی — هر کد ملی یک user/یک student)
  const userRows = [];
  const stuJobs = [];
  const seenNC = new Map(); // nationalCode -> stno (اولین)
  stats.dupNC = 0;
  for (const [stno, c] of main) {
    const s = c._supp || [];
    const rawName = normTxt(c[2]);
    const dash = rawName.lastIndexOf('-');
    const lastName = (dash > 0 ? rawName.slice(0, dash) : rawName).trim().slice(0, 100) || 'نامشخص';
    const firstName = (dash > 0 ? rawName.slice(dash + 1) : '').trim().slice(0, 100) || 'نامشخص';
    let nc = (s[8] || '').trim();
    if (!/^\d{10}$/.test(nc)) { nc = ''; stats.badNC++; }
    else if (checkNationalCode(nc) !== 'ok') stats.ncChecksumWarn++;
    const nationalCode = nc || ('S' + stno.padStart(9, '0')).slice(-10);
    if (seenNC.has(nationalCode)) { stats.dupNC++; continue; }
    seenNC.set(nationalCode, stno);
    const sex = (c[3] || '').trim();
    const mobile = (s[39] || '').replace(/\D/g, '');
    const email = (s[14] || '').trim();
    const post = ((s[12] || '') + (s[84] || '')).replace(/\D/g, '').slice(0, 10);
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
      address: (normTxt(c[28]) || normTxt(s[9])).slice(0, 300) || null,
      firstNameEn: ((c[91] || '').trim() || (c[57] || '').trim()).slice(0, 100) || null,
      lastNameEn: (c[92] || '').trim().slice(0, 100) || null,
      nationality: (nat === '1' || isIr === '1') ? '120001' : null,
      religion: (c[76] || '').trim().slice(0, 10) || null,
      postalCode: post || null,
      passportNumber: (s[24] || '').trim().slice(0, 20) || null,
      isAlive: (['6', '20'].includes((c[4] || '').trim())) ? 0 : 1,
    });
    // students job
    const maghta = (c[7] || '').trim() || '0';
    const reshte = (c[8] || '').trim();
    const status = (c[4] || '').trim();
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
    const accept = (s[16] || '').trim();
    stuJobs.push({
      stno, maghta, reshte, status, entryYear, entryTerm,
      quota: mapQuota(sahmn),
      isaar: [...SHAHED_SAHM, ...STAFF_SAHM].some(x => x === sahmn) ? sahmn : null,
      alloc: lookups.sahmiye.get(sahmn) || null,
      acceptType: lookups.accept.get(accept) || null,
      studyingMode: (c[6] || '').trim().slice(0, 20) || null,
      trainingMethod: (c[78] || '').trim().slice(0, 20) || null,
      nativeType: (c[17] || '').trim().slice(0, 10) || null,
      ethnicity: (s[80] || '').trim().slice(0, 10) || null,
      totalAverage: avg,
      graduateDate: /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(stop) ? stop : null,
      eduEndYear: /^\d{5}$/.test(faregh) ? Number(faregh.slice(0, 4)) : null,
      eduEndSem: /^\d{5}$/.test(faregh) ? Number(faregh.slice(4)) : null,
      localField: reshte.slice(0, 20) || null,
    });
  }
  // ۴) درج users (bulk)
  const ncToId = new Map();
  for (let i = 0; i < userRows.length && !DRY; i += 500) {
    const ch = userRows.slice(i, i + 500);
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
    if ((i / 500) % 20 === 0) console.log(`  users… ${Math.min(i + 500, userRows.length)}/${userRows.length}`);
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
      const regId = await ensureRegulation(degId, j.maghta);
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
    // حذف آنهایی که userId قبلاً دانشجو دارد (از run قبلی یا دادهٔ قدیمی)
    if (!DRY && stuRows.length) {
      const exUserIds = new Set((await q(`SELECT "userId" FROM students WHERE "userId" = ANY($1)`, [stuRows.map(r => r.userId)])) .map(r => String(r.userId)));
      const before = stuRows.length;
      const filtered = stuRows.filter(r => !exUserIds.has(String(r.userId)));
      if (filtered.length !== before) { console.log(`  students: ${before - filtered.length} ردیف با userId تکراری حذف شد`); stats.existingStudents += before - filtered.length; }
      stuRows.length = 0; stuRows.push(...filtered);
    }
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
    const r = await pool.query(`INSERT INTO legacy_code_maps ("sourceCode", domain, "legacyCode", "legacyTitle", "targetCode", note, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("sourceCode", domain, "legacyCode") DO NOTHING`,
      [SOURCE, domain, code, title ? title.slice(0, 250) : null, targetCode || null, note ? JSON.stringify(note).slice(0, 2000) : null, status]);
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
  // ── همهٔ فایل‌های مرجع باقی‌مانده با ستون Code (مقطع، رتبه استاد، نوع درس، نوع دوره، نظام وظیفه، وضعیت نیمسال …) ──
  // هر فایلی که هدر Code+Title داشته باشد ولی در detectFiles جدا نشده بود، اینجا به‌صورت generic معادل می‌شود
  {
    const handled = new Set([files.status, files.markstat, files.sahmiye, files.accept, files.lessonreg].filter(Boolean));
    const skipData = new Set([files.students, files.grades, files.supp, files.terms, files.majors, files.profs, files.schedule, files.curriculum, files.stterm, files.studentsSubsetSkipped].filter(Boolean));
    let allTxt = [];
    try { allTxt = readdirSync(DIR).filter(n => /\.txt$/i.test(n)).map(n => join(DIR, n)); } catch {}
    for (const p of allTxt) {
      if (handled.has(p) || skipData.has(p)) continue;
      let h = [];
      try { h = await readHeaderOnly(p); } catch { continue; }
      if (!h.includes('Code')) continue;
      const hasTitle = h.some(c => /Title/i.test(c));
      if (!hasTitle) continue;
      const base = p.split(/[\\/]/).pop().replace(/\.txt$/i, '').trim();
      const lower = base.toLowerCase();
      let domain;
      if (lower.includes('رتبه')) domain = 'PROF_RANK';
      else if (lower.includes('مقطع')) domain = 'DEGREE_LEVEL';
      else if (lower.includes('نوع درس')) domain = 'COURSE_TYPE';
      else if (lower.includes('نوع دوره')) domain = 'PERIOD_TYPE';
      else if (lower.includes('نظام وظیفه') || lower.includes('وظیفه')) domain = 'MILITARY_STATUS';
      else if (lower.includes('وضعیت نیمسال') && !lower.includes('دانشجو')) domain = 'TERM_STATUS';
      else if (lower.includes('وضعیت دانشجو') || lower.includes('وضعيت دانشجو')) domain = 'STUDENT_STATUS';
      else {
        domain = base.replace(/\s+/g, '_').toUpperCase().replace(/[^A-Z0-9_\u0600-\u06FF]/g, '_').replace(/_+/g, '_').slice(0, 40);
        if (!/^[A-Z_]/.test(domain)) domain = 'LOOKUP_' + domain;
      }
      // اگر دامنه از قبل به‌صورت explicit هندل شده، رد کن تا دوباره‌کاری نشود
      if (['STUDENT_STATUS','GRADE_STATUS','QUOTA','ACCEPT_TYPE','LESSONREG'].includes(domain) && handled.has(p)) continue;
      const titleIdx = h.findIndex(c => /Title/i.test(c));
      const stdIdx = h.findIndex(c => /StandardCode/i.test(c));
      let cnt = 0;
      await readLookup(p, async (c) => {
        const code = (c[0] || '').trim();
        if (!/^-?\d+$/.test(code)) return;
        const title = titleIdx >= 0 ? normTxt(c[titleIdx]) : normTxt(c[1]);
        if (!title) return;
        const std = stdIdx >= 0 ? (c[stdIdx] || '').trim() || null : null;
        await put(domain, code, title, std, { file: base });
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

async function phaseTatbigh(file) {
  console.log('\n── دروس (تطبیق — tatbigh dars.txt) ──');
  const stats = { total: 0, inserted: 0, updated: 0, invalid: 0 };
  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    if (DRY) { batch.length = 0; return; }
    const vals = [];
    const ph = batch.map((r, i) => {
      const o = i * 6;
      vals.push(r.code, r.title, r.theory, r.practical, r.units, r.type);
      return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6})`;
    }).join(',');
    const res = await pool.query(`INSERT INTO courses (code, title, "theoreticalUnits", "practicalUnits", units, "courseType")
      VALUES ${ph}
      ON CONFLICT (code) DO UPDATE SET
        title = EXCLUDED.title,
        "theoreticalUnits" = EXCLUDED."theoreticalUnits",
        "practicalUnits" = EXCLUDED."practicalUnits",
        units = EXCLUDED.units,
        "courseType" = COALESCE(EXCLUDED."courseType", courses."courseType")
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
    const equivRaw = (cols[14] || '').trim();
    if (equivRaw) equivJobs.push({ code, equivRaw });
    stats.total++;
    batch.push({ code: code.slice(0,20), title: title.slice(0,150), theory, practical, units, type: courseType });
    coursesByCode.set(code, -1); // mark as known for later placeholder avoidance
    if (batch.length >= 500) await flush();
  }
  await flush();
  // refresh coursesByCode
  for (const r of await q(`SELECT id, code FROM courses`)) coursesByCode.set(r.code, Number(r.id));
  console.log(`دروس: total=${stats.total} upserted=${stats.inserted} invalid=${stats.invalid} (courses در DB: ${coursesByCode.size})`);
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
  for (const s of ['pre', 'terms', 'majors', 'courses', 'students', 'grades', 'codemap']) {
    if (!STEPS.includes(s)) continue;
    if (s === 'pre') await phasePre();
    if (s === 'terms') { if (!files.terms) throw new Error('فایل ترم‌ها پیدا نشد'); await phaseTerms(files.terms); }
    if (s === 'majors') { if (!files.majors) throw new Error('فایل رشته‌ها پیدا نشد'); await phaseMajors(files.majors); }
    if (s === 'courses') {
      if (files.tatbigh) await phaseTatbigh(files.tatbigh);
      else console.log('\n── دروس: فایل tatbigh dars.txt یافت نشد — از روی placeholder ادامه داده می‌شود');
    }
    if (s === 'students') {
      if (!files.students) throw new Error('فایل دانشجویان پیدا نشد');
      // lookups پذیرش/سهمیه برای همان مرحله
      const lookups = { sahmiye: new Map(), accept: new Map() };
      if (files.sahmiye) for await (const { cols } of tsvRows(files.sahmiye)) {
        if (/^-?\d+$/.test((cols[0] || '').trim())) lookups.sahmiye.set((cols[0] || '').trim(), (cols[3] || '').trim() || null);
      }
      if (files.accept) for await (const { cols } of tsvRows(files.accept)) {
        if (/^-?\d+$/.test((cols[0] || '').trim())) lookups.accept.set((cols[0] || '').trim(), (cols[5] || '').trim() || null);
      }
      await phaseStudents(files, lookups);
    }
    if (s === 'grades') { if (!files.grades) throw new Error('فایل نمرات پیدا نشد'); await phaseGrades(files); }
    if (s === 'codemap') await phaseCodemap(files);
  }
  console.log('\n🎉 کامل شد.');
} catch (err) {
  console.error('❌ خطا:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

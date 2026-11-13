// ورود چارت/برنامهٔ درسی از TSV به دیتابیس — معادل مسیر «مهاجرت چارت» اپ
// ستون‌ها: کد رشته \t از ورودی \t تا ورودی \t کد درس \t ترم پیشنهادی \t نقش \t الزامی
// پیش‌فرض dry؛ نوشتن با --apply و بکاپ JSONL اجباری.
// نسخهٔ موجود (همان رشته/مقطع/بازه) به‌روزرسانی می‌شود؛ ردیف تکراری بی‌صدا رد نمی‌شود.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const req = createRequire(import.meta.url);
const { Pool } = req('pg');

const A = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const k = process.argv[i].slice(2);
    A[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  }
}
const APPLY = A.apply === 'true';
const FILE = A.file || '';
const BACKUP = A.backup || '';
const UNI = Number(A.uni || 1);
const REPORT = A.report || '';
if (!FILE || !existsSync(FILE)) { console.error('--file <tsv> الزامی است'); process.exit(1); }
if (APPLY && !BACKUP) { console.error('--apply نیازمند --backup <file.jsonl> است'); process.exit(1); }

// ── نقش: فارسی → کد کاتالوگ ──
const ROLE_FA = {
  'پایه': 'CORE', 'اصلی': 'MAJOR', 'تخصصی': 'SPECIALIZED', 'اختیاری': 'ELECTIVE', 'انتخابی': 'ELECTIVE',
  'عمومی': 'GENERAL', 'مشترک': 'GENERAL', 'پایان‌نامه': 'THESIS', 'پایان نامه': 'THESIS',
  'کارآموزی': 'INTERNSHIP', 'کارورزی': 'INTERNSHIP', 'کارگاه': 'WORKSHOP', 'جبرانی': 'COMPENSATORY',
};
const ROLE_CODES = new Set(['CORE', 'MAJOR', 'SPECIALIZED', 'ELECTIVE', 'GENERAL', 'THESIS', 'INTERNSHIP', 'WORKSHOP', 'COMPENSATORY']);
const norm = (t) => String(t ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‍\s]+/g, '').toUpperCase();
// ⚠️ نوع درسِ «تعریف» (courses.courseType مثل «نظری-عملی 2س») با نوع درسِ
// «کاتالوگ» (LT9/LessonSubType) یکی نیست و استفاده از آن باعث اشتباه می‌شود.
// نقش فقط از فایل (که خودش از کاتالوگ آمده) گرفته می‌شود؛ نبودِ نقش ⇒ CORE + گزارش.
// عمداً هیچ نگاشت خودکاری از courseType به نقش وجود ندارد.
function roleFromBank() { return null; }
function roleFromFile(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null; // خالی ⇒ از بانک دروس
  if (ROLE_FA[t]) return ROLE_FA[t];
  const n = t.toUpperCase();
  return ROLE_CODES.has(n) ? n : null;
}

// ── خواندن TSV ──
const lines = readFileSync(FILE, 'utf8').split(/\r?\n/);
const rows = [];
let skipped = 0;
for (const ln of lines) {
  if (!ln.trim()) continue;
  const p = ln.split('\t');
  if (p.length < 4) { skipped++; continue; }
  const maj = String(p[0]).trim();
  const yf = p[1] && String(p[1]).trim() !== '' ? Number(p[1]) : null;
  const yt = p[2] && String(p[2]).trim() !== '' ? Number(p[2]) : null;
  const lesson = String(p[3]).trim();
  const sem = p[4] && String(p[4]).trim() !== '' ? Number(p[4]) : null;
  const role = p[5] ? String(p[5]).trim() : '';
  const req = p[6] ? String(p[6]).trim() : '';
  if (!maj || !lesson) { skipped++; continue; }
  rows.push({ maj, yf, yt, lesson, sem, role, req });
}
console.log(`ردیف‌های فایل: ${rows.length} (ردشده: ${skipped})`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const majors = await q(`SELECT id, "majorCode", name, "degreeLevelId" FROM majors WHERE "universityId" = $1`, [UNI]);
const majorByCode = new Map(majors.map(m => [String(m.majorCode), m]));
const courses = await q(`SELECT id, code, units, "courseType" FROM courses WHERE "universityId" = $1`, [UNI]);
const courseByCode = new Map(courses.map(c => [String(c.code), c]));
console.log(`رشته‌های دانشگاه ${UNI}: ${majors.length} | دروس: ${courses.length}`);

// گروه‌بندی
const groups = new Map();
const missingMajors = new Map();
const missingCourses = new Map();
for (const r of rows) {
  const m = majorByCode.get(r.maj);
  if (!m) { missingMajors.set(r.maj, (missingMajors.get(r.maj) || 0) + 1); continue; }
  const c = courseByCode.get(r.lesson);
  if (!c) { missingCourses.set(r.lesson, (missingCourses.get(r.lesson) || 0) + 1); continue; }
  const from = r.yf ?? 1300;
  const to = r.yt ?? null;
  const key = `${m.id}|${m.degreeLevelId}|${from}|${to ?? 'null'}`;
  if (!groups.has(key)) groups.set(key, { majorId: m.id, majorName: m.name, degreeLevelId: m.degreeLevelId, from, to, items: [] });
  groups.get(key).items.push({ courseId: c.id, code: String(c.code), units: c.units, courseType: c.courseType, sem: r.sem, role: r.role, req: r.req });
}
console.log(`گروه‌ها (نسخهٔ چارت): ${groups.size}`);
if (missingMajors.size) console.log('⚠️ رشته‌های ناموجود:', [...missingMajors.entries()].slice(0, 10));
if (missingCourses.size) console.log('⚠️ دروس ناموجود در بانک:', [...missingCourses.entries()].slice(0, 20), `(${missingCourses.size} کد)`);

// ── وضعیت فعلی ──
const existing = await q(`SELECT id, "majorId", "degreeLevelId", "entryYearFrom", "entryYearTo" FROM curriculum_versions WHERE "universityId" = $1`, [UNI]);
const exKey = new Map(existing.map(v => [`${v.majorId}|${v.degreeLevelId}|${v.entryYearFrom}|${v.entryYearTo ?? 'null'}`, v.id]));

let willCreate = 0, willReuse = 0, insRows = 0, updRows = 0, sameRows = 0;
const plan = [];
for (const g of groups.values()) {
  const key = `${g.majorId}|${g.degreeLevelId}|${g.from}|${g.to ?? 'null'}`;
  const verId = exKey.get(key) ?? null;
  if (verId) willReuse++; else willCreate++;
  // جمع واحدها
  const byRole = {}; let total = 0;
  for (const it of g.items) {
    const role = roleFromFile(it.role) ?? 'CORE';
    const u = Number(it.units ?? 0);
    if (!(u > 0)) continue;
    byRole[role] = Math.round(((byRole[role] || 0) + u) * 10) / 10;
    total = Math.round((total + u) * 10) / 10;
  }
  plan.push({ ...g, key, verId, byRole, total });
}

// بررسی ردیف‌های موجود برای شمارش به‌روزرسانی/یکسان
if (true) {
  const ids = plan.filter(p => p.verId).map(p => p.verId);
  const cc = ids.length ? await q(`SELECT "curriculumVersionId", "courseId", "roleType", "isRequired", "recommendedSemester" FROM curriculum_courses WHERE "curriculumVersionId" = ANY($1::int[])`, [ids]) : [];
  const ccMap = new Map(cc.map(r => [`${r.curriculumVersionId}|${r.courseId}`, r]));
  for (const p of plan) {
    if (!p.verId) { insRows += p.items.length; continue; }
    for (const it of p.items) {
      const ex = ccMap.get(`${p.verId}|${it.courseId}`);
      if (!ex) { insRows++; continue; }
      const roleFile = roleFromFile(it.role);
      const patch = (it.sem != null && Number(ex.recommendedSemester ?? -1) !== it.sem)
        || (roleFile && ex.roleType !== roleFile)
        || (Number(ex.isRequired ?? 1) !== (it.req === 'خیر' ? 0 : 1));
      if (patch) updRows++; else sameRows++;
    }
  }
}
console.log(`نسخه‌ها → ساخت: ${willCreate} | موجود: ${willReuse}`);
console.log(`ردیف‌ها → درج: ${insRows} | به‌روزرسانی: ${updRows} | بدون تغییر: ${sameRows}`);

if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({
    file: FILE, uni: UNI, rows: rows.length, groups: groups.size,
    willCreate, willReuse, insRows, updRows, sameRows,
    missingMajors: [...missingMajors.entries()], missingCourses: [...missingCourses.entries()],
  }, null, 2), 'utf8');
  console.log('report:', REPORT);
}

if (!APPLY) { console.log('\n(dry) برای اجرا: --apply --backup <file.jsonl>'); await pool.end(); process.exit(0); }

// ── اجرا ──
if (!existsSync(dirname(BACKUP))) mkdirSync(dirname(BACKUP), { recursive: true });
const log = [];
const client = await pool.connect();
let vMade = 0, iRows = 0, uRows = 0, eRows = 0, noRole = 0;
try {
  await client.query('BEGIN');
  for (const p of plan) {
    let verId = p.verId;
    if (!verId) {
      const label = p.to ? `${p.from}–${p.to}` : `${p.from} به بعد`;
      const code = `LEGACY-${p.from}${p.to ? '-' + p.to : ''}`;
      const ins = await client.query(
        `INSERT INTO curriculum_versions ("majorId","degreeLevelId","trackId","versionCode","title","status",
           "entryYearFrom","entryYearTo","totalRequiredUnits","minRoleUnits","universityId")
         VALUES ($1,$2,NULL,$3,$4,'DRAFT',$5,$6,$7,$8,$9) RETURNING id`,
        [p.majorId, p.degreeLevelId, code, `برنامهٔ درسی مهاجرتی ${p.majorName} (ورودی ${label})`,
          p.from, p.to, String(p.total || 0), JSON.stringify(p.byRole), UNI]);
      verId = ins.rows[0].id;
      vMade++;
      log.push({ entity: 'version', id: verId, key: code });
    }
    for (const it of p.items) {
      const roleFile = roleFromFile(it.role);
      const roleType = roleFile ?? 'CORE';
      if (!roleFile) noRole++;
      const wantReq = it.req === 'خیر' ? 0 : 1;
      const ex = (await client.query(
        `SELECT id, "roleType", "isRequired", "recommendedSemester" FROM curriculum_courses
         WHERE "curriculumVersionId"=$1 AND "courseId"=$2`, [verId, it.courseId])).rows[0];
      if (ex) {
        const sets = []; const vals = [];
        if (it.sem != null && Number(ex.recommendedSemester ?? -1) !== it.sem) { sets.push(`"recommendedSemester"=$${vals.length + 1}`); vals.push(it.sem); }
        if (roleFile && ex.roleType !== roleFile) {
          sets.push(`"roleType"=$${vals.length + 1}`); vals.push(roleFile);
          sets.push(`"isElective"=$${vals.length + 1}`); vals.push(roleFile === 'ELECTIVE' ? 1 : 0);
        }
        if (Number(ex.isRequired ?? 1) !== wantReq) {
          sets.push(`"isRequired"=$${vals.length + 1}`); vals.push(wantReq);
          sets.push(`"isGraduationRequired"=$${vals.length + 1}`); vals.push(wantReq);
        }
        if (!sets.length) { eRows++; continue; }
        vals.push(ex.id);
        await client.query(`UPDATE curriculum_courses SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
        uRows++;
      } else {
        const ins = await client.query(
          `INSERT INTO curriculum_courses ("curriculumVersionId","courseId","roleType","units","isRequired",
             "isElective","isGraduationRequired","recommendedSemester","universityId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [verId, it.courseId, roleType, it.units != null ? String(it.units) : null, wantReq,
            roleType === 'ELECTIVE' ? 1 : 0, wantReq, it.sem, UNI]);
        log.push({ entity: 'cc', id: ins.rows[0].id, versionId: verId });
        iRows++;
      }
    }
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
} finally {
  client.release();
}
writeFileSync(BACKUP, log.map(r => JSON.stringify(r)).join('\n') + (log.length ? '\n' : ''), 'utf8');
console.log(`apply → نسخه‌های ساخته‌شده: ${vMade} | درج: ${iRows} | به‌روزرسانی: ${uRows} | بدون تغییر: ${eRows} | بدون نقش(⇒CORE): ${noRole}`);
console.log('backup:', BACKUP, log.length, 'rows');
await pool.end();

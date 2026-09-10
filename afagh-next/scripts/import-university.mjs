#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════════
 *  واردسازی یکپارچهٔ داده‌های سما (TSV) برای هر دانشگاه
 *
 *  این اسکریپت همهٔ مراحل ETL را با یک دستور و با ترتیب درست اجرا می‌کند:
 *    1. پیش‌نیازها (دانشگاه، نقش‌ها، مقاطع، آیین‌نامه‌ها)
 *    2. ترم‌ها (ترم‌های تحصیلی)
 *    3. رشته‌ها (رشته‌ها + دانشکده‌ها + گروه‌ها)
 *    4. گروه‌های آموزشی
 *    5. دروس (تطبیق کد دروس + واحد/نوع)
 *    6. تطبیق دروس→گروه
 *    7. دانشجویان (users + students)
 *    8. نمرات (legacy_grades + enrollments + course_offerings)
 *    9. وضعیت نیمسال دانشجویان
 *   10. اساتید (users + staff)
 *   11. میز تطبیق کدها (legacy_code_maps)
 *
 *  استفاده:
 *    node scripts/import-university.mjs --dir "E:\git\information afagh" --source AFAGH --dry
 *    node scripts/import-university.mjs --dir /data/information-afagh --source AFAGH
 *    node scripts/import-university.mjs --dir /data/information-afagh --source ZARINE
 *
 *  پارامترها:
 *    --dir <path>     مسیر پوشهٔ حاوی فایل‌های TSV سما (الزامی)
 *    --source <code>  کد دانشگاه (پیش‌فرض: AFAGH) — در جدول universities ثبت می‌شود
 *    --dry            فقط چاپ، تغییری ذخیره نمی‌شود
 *    --limit <n>      حداکثر تعداد سطر برای هر فاز (برای تست)
 *    --db <url>       آدرس PostgreSQL (پیش‌فرض: DATABASE_URL یا localhost)
 *    --skip <phases>  مراحلی که رد شوند (comma-separated): pre,terms,majors,groups,courses,links,students,grades,stterm,professors,codemap
 *    --only <phases>  فقط مراحل مشخص‌شده اجرا شوند (comma-separated)
 * ════════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── آرگومان‌ها ──
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}

const DIR = args.dir;
const SOURCE = (args.source || 'AFAGH').toUpperCase();
const DRY = args.dry === 'true';
const LIMIT = args.limit ? Number(args.limit) : 0;
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const SKIP = new Set((args.skip || '').split(',').map(s => s.trim()).filter(Boolean));
const ONLY = args.only ? new Set((args.only || '').split(',').map(s => s.trim()).filter(Boolean)) : null;

if (!DIR) {
  console.error('❌ پارامتر --dir الزامی است');
  console.error('مثال: node scripts/import-university.mjs --dir "E:\\git\\information afagh" --source AFAGH --dry');
  process.exit(1);
}

if (!existsSync(DIR)) {
  console.error(`❌ پوشه یافت نشد: ${DIR}`);
  process.exit(1);
}

// ── کشف فایل‌ها ──
import { openSync, readSync, closeSync } from 'node:fs';

function readHeaderOnly(filePath) {
  try {
    const buf = Buffer.alloc(8192);
    const fd = openSync(filePath, 'r');
    const { bytesRead } = readSync(fd, buf, 0, 8192, 0);
    closeSync(fd);
    const text = new TextDecoder('windows-1256').decode(buf.subarray(0, bytesRead));
    for (const ln of text.split('\n')) {
      const c = ln.replace(/\r/g, '');
      if (c.trim().length > 3) return c.split('\t').map(x => x.trim());
    }
  } catch {}
  return [];
}

function detectFiles(dir) {
  const found = {};
  const cands = { students: [] };
  const nameMap = {}; // fileName -> fullPath for debugging

  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try { if (!statSync(p).isFile() || !/\.txt$/i.test(name)) continue; } catch { continue; }
    const h = readHeaderOnly(p);
    const H = h.join('\t');
    const has = (...keys) => keys.every(k => h.includes(k));

    nameMap[name] = { size: statSync(p).size, headers: h.slice(0, 5) };

    if (H.startsWith('STNO\tOLDSTNO\tNAME\tSEX')) cands.students.push({ p, name, size: statSync(p).size });
    else if (H.startsWith('Stno\tPriorReshteh')) found.supp = p;
    else if (H.startsWith('Stno\tTermCode\tLessonCode')) found.grades = p;
    else if (H.startsWith('TermCode\tStno\tStTermStatus')) found.stterm = p;
    else if (H.startsWith('TermCode\tLessonCode\tLessonGroup')) found.schedule = p;
    else if (H.startsWith('ID\tCSRUnitID\tLessonCode')) found.curriculum = p;
    else if (has('ProfessorID', 'NationalCode')) found.profs = p;
    else if (H.startsWith('Code\tBdate\tEdate')) found.terms = p;
    else if (has('Maghta', 'Daneshkadeh', 'MinUnit')) found.majors = p;
    else if (has('Avgeffect', 'Uniteffect')) found.markstat = p;
    else if (has('MinPassedMark') && has('Mashrootmark')) found.degrees = p;
    else if (has('IncludedTuition') && has('isDeleted')) found.lessonreg = p;
    else if (has('applicantIsActive')) found.accept = p;
    else if (has('SanjeshCode')) found.sahmiye = p;
    else if (h.join(' ').replace(/\u200c/g, '').includes('تغيير رشته') || h.join(' ').includes('فارغ التحصيل')) found.status = p;
    else if (has('كد', 'نام') && has('مقطع', 'گروه_اموزشي') && has('تعداد_واحد')) found.tatbigh = p;
    else if (has('GroupA', 'Daneshkadeh') && has('Code', 'Oldcode')) found.tatbighMap = p;
    else if (has('Code', 'Name', 'PlaceCode') && h.includes('Admin')) found.groups = p;
    else if (H.startsWith('Code\tTitle\tisActiveInTerm')) found.termstatus = p;
  }

  if (cands.students.length) {
    cands.students.sort((a, b) => {
      const a1 = /students1/i.test(a.name) ? 1 : 0;
      const b1 = /students1/i.test(b.name) ? 1 : 0;
      if (a1 !== b1) return b1 - a1;
      return b.size - a.size;
    });
    found.students = cands.students[0].p;
    if (cands.students[1]) found.studentsSubsetSkipped = cands.students[1].p;
  }
  return found;
}

const files = detectFiles(DIR);
console.log('\n═══ فایل‌های کشف‌شده ═══');
const fileLabels = {
  terms: 'ترم‌ها', majors: 'رشته‌ها', groups: 'گروه‌ها', tatbigh: 'تطبیق دروس',
  tatbighMap: 'تطبیق دروس→گروه', students: 'دانشجویان', grades: 'نمرات',
  stterm: 'وضعیت نیمسال', profs: 'اساتید', supp: 'تکمیلی دانشجویان',
  schedule: 'برنامه ارائه', curriculum: 'riculum', degrees: 'مقاطع',
  markstat: 'وضعیت نمره', accept: 'نحوه پذیرش', sahmiye: 'سهمیه',
  lessonreg: 'وضعیت ثبت‌نام', status: 'وضعیت دانشجو', termstatus: 'وضعیت نیمسال',
};
for (const [key, label] of Object.entries(fileLabels)) {
  const v = files[key];
  if (v) {
    const name = typeof v === 'string' ? v.split(/[\\/]/).pop() : v;
    console.log(`  ✓ ${label}: ${name}`);
  }
}
if (files.studentsSubsetSkipped) console.log(`  ⚠ زیرمجموعه نادیده: ${files.studentsSubsetSkipped}`);

// ── تعیین مراحل قابل اجرا ──
const ALL_PHASES = ['pre', 'terms', 'majors', 'groups', 'courses', 'links', 'students', 'grades', 'stterm', 'professors', 'codemap'];
const REQUIRED_FILES = {
  terms: 'terms', majors: 'majors', students: 'students', grades: 'grades',
};

function shouldRun(phase) {
  if (SKIP.has(phase)) return false;
  if (ONLY && !ONLY.has(phase)) return false;
  if (REQUIRED_FILES[phase] && !files[REQUIRED_FILES[phase]]) {
    console.log(`\n⚠ مرحلهٔ «${phase}» رد شد — فایل مورد نیاز (${fileLabels[REQUIRED_FILES[phase]]}) یافت نشد`);
    return false;
  }
  return true;
}

// ── اجرای مرحله ──
function runScript(script, extraArgs = []) {
  const scriptPath = join(__dirname, script);
  const allArgs = [
    '--dir', DIR,
    '--db', dbUrl,
    ...(LIMIT ? ['--limit', String(LIMIT)] : []),
    ...(DRY ? ['--dry'] : []),
    ...extraArgs,
  ];

  console.log(`\n═══ اجرای ${script} ═══`);
  console.log(`  دستور: node ${script} ${allArgs.join(' ')}`);

  try {
    execFileSync('node', [scriptPath, ...allArgs], {
      stdio: 'inherit',
      timeout: 30 * 60 * 1000, // 30 دقیقه
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    return true;
  } catch (err) {
    console.error(`\n❌ خطا در اجرای ${script}: ${err.message}`);
    if (err.status) console.error(`  کد خروج: ${err.status}`);
    return false;
  }
}

// ── اجرای اصلی ──
const startTime = Date.now();
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  واردسازی یکپارچهٔ داده‌های سما`);
console.log(`  دانشگاه: ${SOURCE} | پوشه: ${DIR}`);
console.log(`  حالت: ${DRY ? 'DRY-RUN (بدون تغییر)' : 'LIVE'}`);
if (LIMIT) console.log(`  محدودیت: ${LIMIT} سطر`);
if (SKIP.size) console.log(`  رد شده: ${[...SKIP].join(', ')}`);
if (ONLY) console.log(`  فقط: ${[...ONLY].join(', ')}`);
console.log('═══════════════════════════════════════════════════════');

let success = true;
let failedPhases = [];

for (const phase of ALL_PHASES) {
  if (!shouldRun(phase)) continue;

  if (phase === 'professors') {
    // اساتید — اسکریپت جداگانه
    if (!files.profs) {
      console.log('\n⚠ مرحلهٔ «professors» رد شد — فایل اساتید (ostadan.txt) یافت نشد');
      continue;
    }
    const ok = runScript('import-professors2.mjs', ['--source', SOURCE]);
    if (!ok) { success = false; failedPhases.push(phase); }
  } else {
    // مراحل ETL اصلی — فقط مراحل مشخص‌شده
    const ok = runScript('import-sama-afagh.mjs', ['--steps', phase, '--source', SOURCE]);
    if (!ok) { success = false; failedPhases.push(phase); }
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('\n═══════════════════════════════════════════════════════');
if (success) {
  console.log(`🎉 واردسازی کامل شد (${elapsed} ثانیه)`);
  console.log(`  دانشگاه: ${SOURCE}`);
  console.log(`  حالت: ${DRY ? 'DRY-RUN' : 'LIVE'}`);
} else {
  console.error(`⚠️  واردسازی با خطا مواجه شد (${elapsed} ثانیه)`);
  console.error(`  مراحل ناموفق: ${failedPhases.join(', ')}`);
  console.error(`  خروجی را بررسی کنید — ممکن است برخی مراحل موفق بوده باشند`);
}
console.log('═══════════════════════════════════════════════════════');

process.exitCode = success ? 0 : 1;

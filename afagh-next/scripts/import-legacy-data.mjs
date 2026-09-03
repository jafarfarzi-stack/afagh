#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  مهاجرت داده‌های قدیمی (دیتابیس قبلی) به آفاق
 *  — لیست رشته‌ها (reshtelist) و لیست اساتید (professorslist)
 *  — فرمت فایل: TSV با انکودینگ Windows-1256 (خروجی مستقیم از دیتابیس قدیمی)
 *
 *  استفاده:
 *    node scripts/import-legacy-data.mjs --majors reshtelist.txt --professors professorslist.txt
 *    node scripts/import-legacy-data.mjs --majors reshtelist.txt --professors professorslist.txt --dry-run
 *    node scripts/import-legacy-data.mjs --majors reshtelist.txt --db postgres://user:pass@host:5432/db
 *
 *  نگاشت:
 *    رشته‌ها → faculties (کددانشکده) → departments (کدگروه) → degree_level_configs → majors
 *    اساتید → users (کد ملی؛ رمز پیش‌فرض scrypt + فلگ mustChangePassword) + staff (staffCode)
 * ══════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
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

const majorsFile = args.majors;
const professorsFile = args.professors;
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const dryRun = args['dry-run'] === 'true';

if (!majorsFile && !professorsFile) {
  console.error('استفاده: node scripts/import-legacy-data.mjs --majors <file> --professors <file> [--dry-run]');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl, max: 5 });

// ── خواندن فایل با انکودینگ قدیمی (Windows-1256) ──
function readTsv(file) {
  const buf = readFileSync(file);
  const text = new TextDecoder('windows-1256').decode(buf);
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.length > 0);
  return { header: lines[0].split('\t'), rows: lines.slice(1).map(l => l.split('\t')) };
}

// ── نرمال‌سازی متن فارسی ──
const norm = (s) => String(s ?? '')
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه')
  .replace(/\u200c/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ── نگاشت عنوان مقطع (فایل قدیمی) → کد مقطع آفاق ──
// ⚠ ترتیب مهم است: «کارشناسی ارشد» باید قبل از «کارشناسی» و «کاردانی ناپیوسته»
//   قبل از «کاردانی» چک شود (زیرا عبارت کوتاه‌تر داخل بلندتر است)
const DEGREE_MAP = [
  [['کارشناسی ارشد'], 'MS', 'کارشناسی ارشد'],
  [['دکتری حرفه‌ای'], 'PHD', 'دکتری حرفه‌ای'],
  [['دکتری'], 'PHD', 'دکتری'],
  [['کارشناسی ناپیوسته'], 'BS', 'کارشناسی ناپیوسته'],
  [['کارشناسی پیوسته'], 'BS', 'کارشناسی پیوسته'],
  [['کارشناسی'], 'BS', 'کارشناسی پیوسته'],
  [['کاردانی ناپیوسته'], 'AD', 'کاردانی ناپیوسته'],
  [['کاردانی پیوسته', 'کاردانی'], 'AD', 'کاردانی پیوسته'],
];
function degreeMatch(raw) {
  const t = norm(raw);
  for (const [keys, code, title] of DEGREE_MAP) {
    if (keys.some(k => t.includes(k))) return { code, title };
  }
  return null;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
  return `${salt}:${hash}`;
}

const q = async (text, params) => (await pool.query(text, params)).rows;
const q1 = async (text, params) => (await q(text, params))[0];

// ── پیدا یا بساز ──
async function ensureFaculty(code, name) {
  if (!code && !name) return null;
  let row = await q1(`SELECT id FROM faculties WHERE "facultyCode" = $1`, [code]);
  if (!row && name && name !== '..') row = await q1(`SELECT id FROM faculties WHERE name = $1`, [name]);
  if (row) return row.id;
  if (dryRun) return -1;
  const ins = await q1(`INSERT INTO faculties (name, "facultyCode") VALUES ($1,$2) RETURNING id`,
    [name && name !== '..' ? name : `دانشکده ${code}`, code || null]);
  return ins.id;
}

async function ensureDepartment(name, facultyId, code) {
  if (!name && !code) return null;
  let row = facultyId > 0 ? await q1(`SELECT id FROM departments WHERE name = $1 AND "facultyId" = $2`, [name, facultyId]) : null;
  if (!row && code) row = await q1(`SELECT id FROM departments WHERE "departmentCode" = $1`, [code]);
  if (row) return row.id;
  if (dryRun) return -1;
  const facId = facultyId > 0 ? facultyId : (await ensureFaculty(null, 'سایر') ?? 0);
  const ins = await q1(`INSERT INTO departments (name, "facultyId", "departmentCode") VALUES ($1,$2,$3) RETURNING id`,
    [name || 'سایر', facId, code || null]);
  return ins.id;
}

async function ensureDegreeLevel(title, code) {
  let row = await q1(`SELECT id FROM degree_level_configs WHERE code = $1`, [code]);
  if (!row) row = await q1(`SELECT id FROM degree_level_configs WHERE title = $1`, [title]);
  if (row) return row.id;
  if (dryRun) return -1;
  const ins = await q1(`INSERT INTO degree_level_configs (title, code, "defaultPassingGrade", "conditionalGpaThreshold", "maxUnitsPerTerm")
    VALUES ($1,$2,10.00,12.00,20) RETURNING id`, [title, code]);
  return ins.id;
}

// ════════════════ ۱) رشته‌ها ════════════════
async function importMajors(file) {
  const { rows } = readTsv(file);
  console.log(`\n📥 رشته‌ها: ${rows.length} ردیف از «${file}»`);
  let ok = 0, skipped = 0;

  for (const r of rows) {
    // 1کدرشته 2عنوان 3کددانشکده 4دانشکده 5کدمقطع 6مقطع 7کدگروه 8گروه 9حداقل‌واحد
    // 10کداستاندارد 11تاریخ‌تاسیس 12تاریخ‌خاتمه 13فعال 14کدمدیرگروه 15کارشناس 16جلسه‌شورا
    const [code, title, facCode, facName, , degTitle, depCode, depName, minUnits,
      stdCode, estDate, termDate, isActive, headCode, expertName, councilDate] = r.map(x => norm(x));

    if (!code || code === '0' || !title || title === 'نامشخص') { skipped++; continue; }
    const deg = degreeMatch(degTitle);
    if (!deg) { console.warn(`  ⚠ مقطع ناشناخته برای «${title}» (${degTitle}) — رد شد`); skipped++; continue; }

    const facultyId = facName && facName !== 'نامشخص' ? await ensureFaculty(facCode || null, facName) : null;
    const departmentId = depName && depName !== 'نامشخص' ? await ensureDepartment(depName, facultyId ?? 0, depCode || null) : null;
    const degreeLevelId = await ensureDegreeLevel(deg.title, deg.code);

    if (dryRun) { ok++; continue; }

    const vals = [title, degreeLevelId, departmentId, code, facultyId,
      minUnits ? Number(minUnits) : null, stdCode || null, estDate || null, termDate || null,
      String(isActive).toUpperCase() === 'TRUE' ? 1 : 0, headCode || null, expertName || null, councilDate || null];

    await pool.query(`INSERT INTO majors (name, "degreeLevelId", "departmentId", "majorCode", "facultyId",
        "minUnits", "standardCode", "establishedDate", "terminatedDate", "isActive", "headStaffCode", "expertName", "lastCouncilDate")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT ("majorCode") DO UPDATE SET name = EXCLUDED.name, "degreeLevelId" = EXCLUDED."degreeLevelId",
        "departmentId" = EXCLUDED."departmentId", "facultyId" = EXCLUDED."facultyId", "minUnits" = EXCLUDED."minUnits",
        "standardCode" = EXCLUDED."standardCode", "establishedDate" = EXCLUDED."establishedDate",
        "terminatedDate" = EXCLUDED."terminatedDate", "isActive" = EXCLUDED."isActive",
        "headStaffCode" = EXCLUDED."headStaffCode", "expertName" = EXCLUDED."expertName",
        "lastCouncilDate" = EXCLUDED."lastCouncilDate"`, vals);
    ok++;
  }
  console.log(`  ✅ ${ok} رشته ${dryRun ? '(پیش‌نمایش)' : 'وارد/به‌روزرسانی شد'} — ${skipped} ردیف نادیده گرفته شد`);
}

// ════════════════ ۲) اساتید ════════════════
async function importProfessors(file) {
  const { rows } = readTsv(file);
  console.log(`\n📥 اساتید: ${rows.length} ردیف از «${file}»`);
  let ok = 0, skipped = 0, newUsers = 0;

  for (const r of rows) {
    // 1کد 2لقب 3نام 4نام‌خانوادگی 5نام‌خان+نام 6دانشکده 7گروه 8فعال 9طریقه‌همکاری 10مدرک
    // 11شماره‌مستخدم 12نوع‌استخدام 13مرتبه 14تاریخ‌استخدام 15سال‌مدرک 16رشته 17نام‌پدر
    // 18شماره‌شناسنامه 19تاریخ‌تولد 20محل‌تولد 21محل‌صدور 22جنسیت 23تلفن 24موبایل 25آدرس
    // 26ایمیل 27کدملی 28کدتاهل 29تاهل 30رشته‌وگرایش 31کدکشور 32دانشگاه 33پایه 34استان‌تولد
    // 35شهرتولد 36شماره‌حساب
    const [code, title, firstName, lastName, , facName, depName, active, coopType,
      degree, personnelNo, empType, rank, hireDate, lastDegYear, ,
      fatherName, certNo, birthDate, birthPlace, issuePlace, gender, phone, mobile,
      address, email, nationalCode, maritalCode, marital, fieldBranch, countryCode, university,
      base, birthProv, birthCity, bankNo] = r.map(x => norm(x));

    const nc = nationalCode && /^\d{10}$/.test(nationalCode) ? nationalCode : null;
    if (!code || code === '0' || (!nc && !personnelNo) || lastName === 'نامشخص') { skipped++; continue; }

    if (dryRun) { ok++; continue; }

    const isActive = String(active).toUpperCase() === 'فعال' ? 1 : String(active).toUpperCase() === 'غیر فعال' ? 0 : 1;

    // ── کاربر یکپارچه (کد ملی = کلید) ──
    let userId;
    if (nc) {
      const passwordHash = hashPassword('123456');
      const [u] = await q(`INSERT INTO users ("nationalCode", "firstName", "lastName", mobile, email, "passwordHash",
          "fatherName", "birthCertNo", "birthDate", "placeOfBirth", "placeOfIssue", gender, address, "isActive", "mustChangePassword")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1)
        ON CONFLICT ("nationalCode") DO UPDATE SET mobile = COALESCE(EXCLUDED.mobile, users.mobile), email = COALESCE(EXCLUDED.email, users.email)
        RETURNING id`, [nc, firstName || 'بدون‌نام', lastName, mobile || null, email || null, passwordHash,
        fatherName || null, certNo || null, birthDate || null, birthPlace || null, issuePlace || null,
        gender === '1' ? 'FEMALE' : gender === '2' ? 'MALE' : null, address || null, isActive]);
      userId = u.id;
      newUsers++;
    } else {
      // بدون کد ملی معتبر → فقط پروندهٔ استاد با شمارهٔ مستخدم (کاربر موقت با کد مصنوعی)
      const passwordHash = hashPassword('123456');
      const [u] = await q(`INSERT INTO users ("nationalCode", "firstName", "lastName", "passwordHash", "isActive", "mustChangePassword")
        VALUES ($1,$2,$3,$4,$5,1) ON CONFLICT ("nationalCode") DO UPDATE SET "lastName" = EXCLUDED."lastName" RETURNING id`,
        ['S' + code.padStart(9, '0'), firstName || 'بدون‌نام', lastName || code, passwordHash, isActive]);
      userId = u.id;
      newUsers++;
    }

    // ── پروندهٔ استاد (staffCode = کلید) ──
    const vals = [userId, code, title || null, degree || null, rank || null, facName || null, depName || null,
      isActive, coopType || null, personnelNo || null, empType || null, hireDate || null,
      lastDegYear ? Number(lastDegYear) : null, fieldBranch || null,
      maritalCode ? Number(maritalCode) : null, marital || null, countryCode || null, university || null,
      base || null, birthProv || null, birthCity || null, bankNo || null, phone || null];

    await pool.query(`INSERT INTO staff ("userId", "staffCode", title, degree, "academicRank",
        "facultyId", "departmentId", "isActive", "cooperationType", "personnelNo", "employmentType",
        "hireDate", "lastDegreeYear", "fieldOfStudy", "maritalStatusCode", "maritalStatus",
        "lastDegreeCountryCode", "lastDegreeUniversity", "academicBase", "birthProvince", "birthCity",
        "bankAccountNo", phone)
      VALUES ($1,$2,$3,$4,$5,(SELECT id FROM faculties WHERE name = $6 LIMIT 1),(SELECT id FROM departments WHERE name = $7 LIMIT 1),
        $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      ON CONFLICT ("staffCode") DO UPDATE SET title = EXCLUDED.title, degree = EXCLUDED.degree,
        "academicRank" = EXCLUDED."academicRank", "isActive" = EXCLUDED."isActive",
        "cooperationType" = EXCLUDED."cooperationType", "personnelNo" = EXCLUDED."personnelNo",
        "employmentType" = EXCLUDED."employmentType", "hireDate" = EXCLUDED."hireDate",
        "lastDegreeYear" = EXCLUDED."lastDegreeYear", "fieldOfStudy" = EXCLUDED."fieldOfStudy",
        "maritalStatusCode" = EXCLUDED."maritalStatusCode", "maritalStatus" = EXCLUDED."maritalStatus",
        "lastDegreeCountryCode" = EXCLUDED."lastDegreeCountryCode",
        "lastDegreeUniversity" = EXCLUDED."lastDegreeUniversity", "academicBase" = EXCLUDED."academicBase",
        "birthProvince" = EXCLUDED."birthProvince", "birthCity" = EXCLUDED."birthCity",
        "bankAccountNo" = EXCLUDED."bankAccountNo", phone = EXCLUDED.phone`, vals);
    ok++;
  }
  console.log(`  ✅ ${ok} استاد ${dryRun ? '(پیش‌نمایش)' : 'وارد/به‌روزرسانی شد'} (${newUsers} کاربر) — ${skipped} ردیف نادیده گرفته شد`);
}

try {
  // ── حالت تست پارس (بدون اتصال به دیتابیس) ──
  if (args['parse-only'] === 'true') {
    for (const [label, file] of [['رشته‌ها', majorsFile], ['اساتید', professorsFile]]) {
      if (!file) continue;
      const { header, rows } = readTsv(file);
      console.log(`\n🔍 ${label} — سربرگ: ${header.length} ستون، ${rows.length} ردیف`);
      const sample = rows.find(r => r[0] !== '0' && norm(r[1]) !== 'نامشخص');
      if (sample) console.log(`  نمونه: ${sample.slice(0, 8).map(norm).join(' | ')}`);
      if (label === 'رشته‌ها') {
        let known = 0, unknown = 0;
        for (const r of rows) { degreeMatch(r[5]) ? known++ : unknown++; }
        console.log(`  مقاطع شناسایی‌شده: ${known} — ناشناخته: ${unknown}`);
        const degs = [...new Set(rows.map(r => norm(r[5])).filter(Boolean))];
        for (const d of degs) console.log(`    • ${d} → ${degreeMatch(d)?.code ?? '⚠ ناشناخته'}`);
      }
    }
    console.log('\n✅ پارس سالم است.');
    process.exit(0);
  }

  if (majorsFile) await importMajors(majorsFile);
  if (professorsFile) await importProfessors(professorsFile);
  console.log('\n🎉 کامل شد.');
} catch (err) {
  console.error('❌ خطا:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

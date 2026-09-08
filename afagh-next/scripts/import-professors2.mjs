#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  غنی‌سازی پرونده اساتید از «اساتید2.txt» (سما) — کلید تطبیق: کد استاد
 *  — انکودینگ: Windows-1256، جداکننده: تب، هدر فارسی (کد/لقب/نام/…)
 *  — به‌روزرسانی fill-if-empty (فقط فیلدهای خالی پر می‌شود؛ دادهٔ دستی نمی‌پرد)
 *  — دانشکده/گروه با تطبیق «نام» پیدا می‌شود؛ اگر نباشد ساخته نمی‌شود (گزارش می‌شود)
 *
 *  استفاده:
 *    node scripts/import-professors2.mjs --dir "E:\git\information afagh" --dry
 *    node scripts/import-professors2.mjs --dir ... --limit 20 --dry
 *    node scripts/import-professors2.mjs --dir ...            # اجرای واقعی
 *    node scripts/import-professors2.mjs --file x.txt --db postgres://...
 * ══════════════════════════════════════════════════════════════════════
 */
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
function resolveFile() {
  if (args.file) return args.file;
  const dir = args.dir || (existsSync('/data/اساتید2.txt') ? '/data' : 'E:\\git\\information afagh');
  // نام فایل ممکن است «اساتید2.txt» یا با فاصله/نیم‌فاصله باشد — با پیشوند پیدا کن
  try {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      try { if (!statSync(p).isFile() || !/\.txt$/i.test(n)) continue; } catch { continue; }
      const base = n.replace(/\.txt$/i, '');
      if (/اساتید\s*2|اساتيد\s*2/.test(base)) return p;
    }
  } catch {}
  return join(dir, 'اساتید2.txt');
}
const FILE = resolveFile();
const LIMIT = args.limit ? Number(args.limit) : 0;
const DRY = args.dry === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';

const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (text, params) => (await pool.query(text, params)).rows;

// ── خواندن جریانی TSV ──
const dec1256 = new TextDecoder('windows-1256');
async function* tsvRows(path) {
  const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let header = null;
  let yielded = 0;
  for await (const chunk of stream) {
    const buf = Buffer.concat([carry, chunk]);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) {
        const line = dec1256.decode(buf.subarray(start, i)).replace(/\r/g, '');
        start = i + 1;
        if (!line.trim()) continue;
        const cols = line.split('\t');
        if (!header) { header = cols.map(c => c.trim()); continue; }
        yielded++;
        yield { header, cols };
        if (LIMIT && yielded >= LIMIT) { stream.destroy(); return; }
      }
    }
    carry = buf.subarray(start);
  }
}

// ── ابزار ──
const clean = (s) => String(s ?? '').replace(/\x00/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه');
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
  const m = String(s || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const g = jalaliToGregorian(+m[1], +m[2], +m[3]);
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
  return isNaN(d.getTime()) ? null : d;
}
function normMobile(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return d;
  if (/^9\d{9}$/.test(d)) return '0' + d;
  if (/^989\d{9}$/.test(d)) return '0' + d.slice(3);
  return null;
}
function mapGender(s) {
  const t = clean(s);
  if (t === '1' || t === 'مرد' || t === 'آقا' || t === 'آقای') return 'MALE';
  if (t === '2' || t === 'زن' || t === 'خانم') return 'FEMALE';
  return null;
}
function mapActive(s) {
  const t = norm(s);
  if (/غیر\s*فعال/.test(t)) return 0;
  if (/فعال/.test(t)) return 1;
  return null;
}
function extractYear(s) {
  const m = String(s || '').match(/(13|14)\d{2}/);
  return m ? Number(m[0]) : null;
}

// ── کش دانشکده/گروه (تطبیق با نام) ──
const facultyByName = new Map();
const deptByName = new Map(); // name -> [{id, facultyId}]
async function loadCaches() {
  for (const r of await q(`SELECT id, name FROM faculties`)) {
    const k = norm(r.name);
    if (k && !facultyByName.has(k)) facultyByName.set(k, Number(r.id));
  }
  for (const r of await q(`SELECT id, name, "facultyId" FROM departments`)) {
    const k = norm(r.name);
    if (!k) continue;
    if (!deptByName.has(k)) deptByName.set(k, []);
    deptByName.get(k).push({ id: Number(r.id), facultyId: r.facultyId == null ? null : Number(r.facultyId) });
  }
  console.log(`کش: ${facultyByName.size} دانشکده، ${deptByName.size} نام گروه`);
}

// ── اجرا ──
try {
  console.log(`Professors2 enrich | file=${FILE} | limit=${LIMIT || '∞'} | ${DRY ? 'DRY-RUN' : 'LIVE'}`);
  await loadCaches();
  const stats = { total: 0, matched: 0, updatedStaff: 0, updatedUser: 0, missing: 0, badCode: 0, facMiss: new Set(), deptMiss: new Set(), ncConflict: 0, activeMismatch: 0 };
  const missingCodes = [];
  for await (const { cols } of tsvRows(FILE)) {
    const code = clean(cols[0]);
    if (!/^\d+$/.test(code) || code === '0') { stats.badCode++; continue; }
    stats.total++;
    // ستون‌ها (ایندکس ثابت — هدر فارسی با کاف عربی است)
    const F = {
      title: norm(cols[1]) || null,
      firstName: norm(cols[2]) || null,
      lastName: norm(cols[3]) || null,
      faculty: norm(cols[5]) || null,
      dept: norm(cols[6]) || null,
      active: mapActive(cols[7]),
      coop: norm(cols[8]) || null,
      degree: norm(cols[9]) || null,
      personnelNo: clean(cols[10]) || null,
      employment: norm(cols[11]) || null,
      rank: norm(cols[12]) || null,
      hireDate: clean(cols[13]).slice(0, 10) || null,
      degreeYear: extractYear(cols[14]),
      field: norm(cols[15]) || null,
      father: norm(cols[16]) || null,
      birthCert: clean(cols[17]) || null,
      birthDate: faDate(cols[18]),
      birthPlace: norm(cols[19]) || null,
      issuePlace: norm(cols[20]) || null,
      gender: mapGender(cols[21]),
      phone: clean(cols[22]).slice(0, 20) || null,
      mobile: normMobile(cols[23]),
      address: norm(cols[24]).slice(0, 300) || null,
      email: (() => { const e = clean(cols[25]); return /@/.test(e) ? e.slice(0, 150) : null; })(),
      nationalCode: (/^\d{10}$/.test(clean(cols[26])) ? clean(cols[26]) : null),
      maritalCode: (/^\d+$/.test(clean(cols[27])) ? Number(clean(cols[27])) : null),
      marital: norm(cols[28]) && norm(cols[28]) !== 'نا مشخص' ? norm(cols[28]).slice(0, 20) : null,
      fieldMain: norm(cols[29]).slice(0, 200) || null,
      degreeCountry: clean(cols[30]) || null,
      degreeUniv: norm(cols[31]).slice(0, 200) || null,
      base: clean(cols[32]) || null,
      birthProv: norm(cols[33]).slice(0, 100) || null,
      birthCity: norm(cols[34]).slice(0, 100) || null,
      bankAcc: clean(cols[35]).slice(0, 50) || null,
    };
    // دانشکده/گروه
    let facultyId = F.faculty ? (facultyByName.get(F.faculty) ?? null) : null;
    if (F.faculty && facultyId == null) stats.facMiss.add(F.faculty);
    let deptId = null;
    if (F.dept) {
      const cands = deptByName.get(F.dept) || [];
      const sameFac = facultyId != null ? cands.find(c => c.facultyId === facultyId) : null;
      deptId = (sameFac || cands[0] || {}).id ?? null;
      if (deptId == null) stats.deptMiss.add(F.dept);
    }
    // تطبیق با کد استاد
    const st = (await q(`SELECT s.id, s."userId", s."isActive" FROM staff s WHERE s."staffCode" = $1`, [code]))[0];
    if (!st) {
      stats.missing++;
      if (missingCodes.length < 20) missingCodes.push(code);
      continue;
    }
    stats.matched++;
    if (F.active !== null && st.isActive !== null && Number(st.isActive) !== F.active) stats.activeMismatch++;
    if (DRY) continue;
    //冲突 کد ملی با کاربر دیگر؟
    let ncOk = F.nationalCode;
    if (ncOk) {
      const clash = (await q(`SELECT id FROM users WHERE "nationalCode" = $1 AND id <> $2`, [ncOk, st.userId]))[0];
      if (clash) { ncOk = null; stats.ncConflict++; }
    }
    const r1 = await pool.query(`UPDATE staff SET
        title = COALESCE(NULLIF(title,''), $2),
        "facultyId" = COALESCE("facultyId", $3),
        "departmentId" = COALESCE("departmentId", $4),
        "isActive" = COALESCE("isActive", $5),
        "cooperationType" = COALESCE(NULLIF("cooperationType",''), $6),
        degree = COALESCE(NULLIF(degree,''), $7),
        "personnelNo" = COALESCE(NULLIF("personnelNo",''), $8),
        "employmentType" = COALESCE(NULLIF("employmentType",''), $9),
        "academicRank" = COALESCE(NULLIF("academicRank",''), $10),
        "hireDate" = COALESCE(NULLIF("hireDate",''), $11),
        "lastDegreeYear" = COALESCE("lastDegreeYear", $12),
        "fieldOfStudy" = COALESCE(NULLIF("fieldOfStudy",''), $13),
        "fieldMain" = COALESCE(NULLIF("fieldMain",''), $14),
        "maritalStatusCode" = COALESCE("maritalStatusCode", $15),
        "maritalStatus" = COALESCE(NULLIF("maritalStatus",''), $16),
        "lastDegreeCountryCode" = COALESCE(NULLIF("lastDegreeCountryCode",''), $17),
        "lastDegreeUniversity" = COALESCE(NULLIF("lastDegreeUniversity",''), $18),
        "academicBase" = COALESCE(NULLIF("academicBase",''), $19),
        "birthProvince" = COALESCE(NULLIF("birthProvince",''), $20),
        "birthCity" = COALESCE(NULLIF("birthCity",''), $21),
        "bankAccountNo" = COALESCE(NULLIF("bankAccountNo",''), $22),
        phone = COALESCE(NULLIF(phone,''), $23)
      WHERE id = $1`,
      [st.id, F.title, facultyId, deptId, F.active, F.coop, F.degree, F.personnelNo,
       F.employment, F.rank, F.hireDate, F.degreeYear, F.field, F.fieldMain, F.maritalCode,
       F.marital, F.degreeCountry, F.degreeUniv, F.base, F.birthProv, F.birthCity, F.bankAcc, F.phone]);
    if (r1.rowCount) stats.updatedStaff++;
    const r2 = await pool.query(`UPDATE users SET
        "firstName" = COALESCE(NULLIF("firstName",''), $2),
        "lastName" = COALESCE(NULLIF("lastName",''), $3),
        "fatherName" = COALESCE(NULLIF("fatherName",''), $4),
        "birthCertNo" = COALESCE(NULLIF("birthCertNo",''), $5),
        "placeOfBirth" = COALESCE(NULLIF("placeOfBirth",''), $6),
        "placeOfIssue" = COALESCE(NULLIF("placeOfIssue",''), $7),
        "birthDate" = COALESCE("birthDate", $8),
        gender = COALESCE(NULLIF(gender,''), $9),
        address = COALESCE(NULLIF(address,''), $10),
        email = COALESCE(NULLIF(email,''), $11),
        mobile = COALESCE(NULLIF(mobile,''), $12),
        "nationalCode" = COALESCE(NULLIF("nationalCode",''), $13)
      WHERE id = $1`,
      [st.userId, F.firstName, F.lastName, F.father, F.birthCert, F.birthPlace, F.issuePlace,
       F.birthDate, F.gender, F.address, F.email, F.mobile, ncOk]);
    if (r2.rowCount) stats.updatedUser++;
  }
  console.log(`\nاساتید2: total=${stats.total} matched=${stats.matched} missing=${stats.missing} bad=${stats.badCode}`);
  console.log(`به‌روزرسانی: staff=${stats.updatedStaff} users=${stats.updatedUser} تداخل کدملی=${stats.ncConflict} مغایرت فعالی=${stats.activeMismatch}`);
  if (stats.facMiss.size) console.log(`دانشکده‌های بی‌تطبیق (${stats.facMiss.size}): ${[...stats.facMiss].slice(0, 10).join('، ')}`);
  if (stats.deptMiss.size) console.log(`گروه‌های بی‌تطبیق (${stats.deptMiss.size}): ${[...stats.deptMiss].slice(0, 10).join('، ')}`);
  if (missingCodes.length) console.log(`کدهای بدون پرونده (اول ${missingCodes.length} تا): ${missingCodes.join('، ')}${stats.missing > missingCodes.length ? ` (+${stats.missing - missingCodes.length} تای دیگر)` : ''}`);
  console.log(DRY ? 'DRY-RUN — چیزی نوشته نشد.' : '🎉 کامل شد.');
} catch (err) {
  console.error('❌ خطا:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

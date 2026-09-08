#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  بازسازی کامل پروندهٔ اساتید از «اساتید2.txt» (سما) — از صفر
 *  ۱) حذف اساتید دمو (staffCode غیرعددی: F-LO…/SCT-…) — فقط یکی می‌ماند
 *  ۲) درج/به‌روزرسانی کامل همهٔ ردیف‌های فایل با کلید «کد استاد»
 *     (بازنویسی همهٔ فیلدها — فایل مرجع حقیقت است)
 *
 *  استفاده:
 *    node scripts/import-professors2.mjs --dir "E:\git\information afagh" --dry
 *    node scripts/import-professors2.mjs --dir ... --limit 20 --dry
 *    node scripts/import-professors2.mjs --dir ...                     # اجرای واقعی
 *    node scripts/import-professors2.mjs --dir ... --no-purge          # بدون حذف دمو
 *    node scripts/import-professors2.mjs --dir ... --keep-demo SCT-PF01 # نگه‌داشتن دموی مشخص
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
  try {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      try { if (!statSync(p).isFile() || !/\.txt$/i.test(n)) continue; } catch { continue; }
      const base = n.replace(/\.txt$/i, '');
      if (/اساتید\s*2|اساتيد\s*2|ostadan/i.test(base)) return p;
    }
  } catch {}
  return join(dir, 'اساتید2.txt');
}
const FILE = resolveFile();
const LIMIT = args.limit ? Number(args.limit) : 0;
const DRY = args.dry === 'true';
const PURGE = args['no-purge'] !== 'true';
const KEEP_DEMO = args['keep-demo'] || null;
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
const synthNC = (code) => ('9' + String(code).replace(/\D/g, '').padStart(9, '0')).slice(-10);

// ── کش دانشکده/گروه ──
const facultyByName = new Map();
const deptByName = new Map();
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

// ── مرحله ۱: حذف دموها (فقط یکی می‌ماند) ──
async function purgeDemos() {
  const demos = await q(`SELECT id, "staffCode", "userId" FROM staff WHERE "staffCode" !~ '^\\d+$' ORDER BY id`);
  if (!demos.length) { console.log('دمویی برای حذف نیست.'); return; }
  let keeper = null;
  if (KEEP_DEMO) keeper = demos.find(d => d.staffCode === KEEP_DEMO) || null;
  if (!keeper) keeper = demos[0];
  const victims = demos.filter(d => d.id !== keeper.id);
  console.log(`دمو: ${demos.length} مورد → نگه‌داری [${keeper.staffCode}]، حذف ${victims.length} مورد`);
  if (DRY) return;
  const vIds = victims.map(v => v.id);
  const vUids = [...new Set(victims.map(v => v.userId))];
  // آزادسازی ارجاع‌ها
  await pool.query(`UPDATE departments SET "headStaffId"=NULL WHERE "headStaffId"=ANY($1)`, [vIds]);
  const offN = (await pool.query(`UPDATE course_offerings SET "professorId"=NULL WHERE "professorId"=ANY($1)`, [vIds])).rowCount;
  const opN = (await pool.query(`DELETE FROM offering_professors WHERE "staffId"=ANY($1)`, [vIds])).rowCount;
  const avN = (await pool.query(`DELETE FROM professor_availabilities WHERE "staffId"=ANY($1)`, [vIds])).rowCount;
  try { await pool.query(`DELETE FROM professor_term_contracts WHERE "staffId"=ANY($1)`, [vIds]); } catch {}
  try { await pool.query(`DELETE FROM grade_submission_otps WHERE "staffId"=ANY($1)`, [vIds]); } catch {}
  await pool.query(`DELETE FROM user_roles WHERE "userId"=ANY($1)`, [vUids]);
  await pool.query(`DELETE FROM sessions WHERE "userId"=ANY($1)`, [vUids]);
  const stN = (await pool.query(`DELETE FROM staff WHERE id=ANY($1)`, [vIds])).rowCount;
  // کاربر دمو فقط اگر دانشجو نباشد حذف شود
  let uN = 0, uKeep = 0;
  for (const uid of vUids) {
    const hasStu = (await q(`SELECT 1 FROM students WHERE "userId"=$1 LIMIT 1`, [uid]))[0];
    if (hasStu) { uKeep++; continue; }
    try { uN += (await pool.query(`DELETE FROM users WHERE id=$1`, [uid])).rowCount; }
    catch (e) { uKeep++; }
  }
  console.log(`  حذف شد: staff=${stN} users=${uN} (نگه‌داشته user=${uKeep}) | آزادسازی: offerings.prof=${offN} offering_profs=${opN} avail=${avN}`);
}

// ── اجرا ──
try {
  console.log(`Professors fresh | file=${FILE} | limit=${LIMIT || '∞'} | ${DRY ? 'DRY-RUN' : 'LIVE'} | purge=${PURGE ? 'ON' : 'OFF'}`);
  if (!DRY) {
    if (PURGE) await purgeDemos();
    await loadCaches();
  }
  let profRoleId = null;
  if (!DRY) profRoleId = (await q(`SELECT id FROM roles WHERE code='PROFESSOR'`))[0]?.id ?? null;

  const stats = { total: 0, badCode: 0, createdUser: 0, updatedUser: 0, createdStaff: 0, updatedStaff: 0, facMiss: new Set(), deptMiss: new Set(), ncFallback: 0 };
  for await (const { cols } of tsvRows(FILE)) {
    const code = clean(cols[0]);
    if (!/^\d+$/.test(code) || code === '0') { stats.badCode++; continue; }
    stats.total++;
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
      fieldMain: norm(cols[15]).slice(0, 200) || null,   // «رشته» → fieldMain (مطابق کامنت اسکیما)
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
      field: norm(cols[29]).slice(0, 200) || null,       // «رشته و گرایش» → fieldOfStudy (مطابق کامنت اسکیما)
      degreeCountry: clean(cols[30]) || null,
      degreeUniv: norm(cols[31]).slice(0, 200) || null,
      base: clean(cols[32]) || null,
      birthProv: norm(cols[33]).slice(0, 100) || null,
      birthCity: norm(cols[34]).slice(0, 100) || null,
      bankAcc: clean(cols[35]).slice(0, 50) || null,
    };
    if (DRY) {
      if (stats.total <= 5 || stats.total % 200 === 0) {
        console.log(`[DRY] code=${code} ${F.lastName} ${F.firstName} | NC=${F.nationalCode || synthNC(code) + '*'}`);
      }
      continue;
    }
    // دانشکده/گروه از روی نام
    let facultyId = F.faculty ? (facultyByName.get(F.faculty) ?? null) : null;
    if (F.faculty && facultyId == null) stats.facMiss.add(F.faculty);
    // «نامشخص» گروه را نادیده بگیر
    const deptName = F.dept && F.dept !== 'نامشخص' ? F.dept : null;
    let deptId = null;
    if (deptName) {
      const cands = deptByName.get(deptName) || [];
      const sameFac = facultyId != null ? cands.find(c => c.facultyId === facultyId) : null;
      deptId = (sameFac || cands[0] || {}).id ?? null;
      if (deptId == null) stats.deptMiss.add(deptName);
    }
    // ── کاربر: اول کدملی واقعی، بعد مصنوعی ──
    let nc = F.nationalCode;
    if (!nc) { nc = synthNC(code); stats.ncFallback++; }
    const clash = (await q(`SELECT id FROM users WHERE "nationalCode"=$1`, [nc]))[0];
    let userId;
    const fn = (F.firstName || F.lastName || 'نامشخص').slice(0, 100);
    const ln = (F.lastName || F.firstName || 'نامشخص').slice(0, 100);
    if (clash) {
      userId = clash.id;
      // آیا این کاربرِ همین استاد است (staff با همین staffCode)؟ اگر نه → مصنوعی جدا
      const owner = (await q(`SELECT id FROM staff WHERE "userId"=$1 AND "staffCode"<>$2 LIMIT 1`, [userId, code]))[0];
      if (owner) { nc = synthNC(code); stats.ncFallback++; }
    }
    let u = (await q(`SELECT id FROM users WHERE "nationalCode"=$1`, [nc]))[0];
    if (u) {
      userId = u.id;
      await pool.query(`UPDATE users SET "firstName"=$2,"lastName"=$3,mobile=COALESCE($4,mobile),email=COALESCE($5,email),
        "birthCertNo"=COALESCE($6,"birthCertNo"),"birthDate"=COALESCE($7,"birthDate"),"fatherName"=COALESCE($8,"fatherName"),
        gender=COALESCE($9,gender),address=COALESCE($10,address),"placeOfBirth"=COALESCE($11,"placeOfBirth"),
        "placeOfIssue"=COALESCE($12,"placeOfIssue"),"isActive"=1 WHERE id=$1`,
        [userId, fn, ln, F.mobile, F.email, F.birthCert, F.birthDate, F.father, F.gender, F.address, F.birthPlace, F.issuePlace]);
      stats.updatedUser++;
    } else {
      const ins = (await pool.query(`INSERT INTO users ("nationalCode","firstName","lastName",mobile,email,"birthCertNo","birthDate",
          "fatherName",gender,address,"placeOfBirth","placeOfIssue","passwordHash","isActive","mustChangePassword")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,1) RETURNING id`,
        [nc, fn, ln, F.mobile, F.email, F.birthCert, F.birthDate, F.father, F.gender, F.address, F.birthPlace, F.issuePlace, 'MIGRATED:' + code]))[0];
      userId = ins.id;
      stats.createdUser++;
    }
    // ── پروندهٔ کارمندی: بازنویسی کامل ──
    const ex = (await q(`SELECT id FROM staff WHERE "staffCode"=$1`, [code]))[0];
    if (ex) {
      await pool.query(`UPDATE staff SET "userId"=$2,title=$3,"facultyId"=$4,"departmentId"=$5,"isActive"=COALESCE($6,"isActive",1),
        "cooperationType"=$7,degree=$8,"personnelNo"=$9,"employmentType"=$10,"academicRank"=$11,"hireDate"=$12,
        "lastDegreeYear"=$13,"fieldOfStudy"=$14,"fieldMain"=$15,"maritalStatusCode"=$16,"maritalStatus"=$17,
        "lastDegreeCountryCode"=$18,"lastDegreeUniversity"=$19,"academicBase"=$20,"birthProvince"=$21,"birthCity"=$22,
        "bankAccountNo"=$23,phone=$24 WHERE id=$1`,
        [ex.id, userId, F.title, facultyId, deptId, F.active, F.coop, F.degree, F.personnelNo, F.employment, F.rank,
         F.hireDate, F.degreeYear, F.field, F.fieldMain, F.maritalCode, F.marital, F.degreeCountry, F.degreeUniv,
         F.base, F.birthProv, F.birthCity, F.bankAcc, F.phone]);
      stats.updatedStaff++;
    } else {
      await pool.query(`INSERT INTO staff ("userId","staffCode",title,"facultyId","departmentId","isActive","cooperationType",
          degree,"personnelNo","employmentType","academicRank","hireDate","lastDegreeYear","fieldOfStudy","fieldMain",
          "maritalStatusCode","maritalStatus","lastDegreeCountryCode","lastDegreeUniversity","academicBase",
          "birthProvince","birthCity","bankAccountNo",phone)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6,1),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [userId, code, F.title, facultyId, deptId, F.active, F.coop, F.degree, F.personnelNo, F.employment, F.rank,
         F.hireDate, F.degreeYear, F.field, F.fieldMain, F.maritalCode, F.marital, F.degreeCountry, F.degreeUniv,
         F.base, F.birthProv, F.birthCity, F.bankAcc, F.phone]);
      stats.createdStaff++;
    }
    if (profRoleId) {
      await pool.query(`INSERT INTO user_roles ("userId","roleId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, profRoleId]);
    }
    if (stats.total % 300 === 0) console.log(`  … ${stats.total} (staff+${stats.createdStaff}/~${stats.updatedStaff})`);
  }
  console.log(`\nاساتید: total=${stats.total} bad=${stats.badCode} | users +${stats.createdUser}/~${stats.updatedUser} | staff +${stats.createdStaff}/~${stats.updatedStaff} | کدملی مصنوعی=${stats.ncFallback}`);
  if (stats.facMiss.size) console.log(`دانشکده‌های بی‌تطبیق (${stats.facMiss.size}): ${[...stats.facMiss].slice(0, 10).join('، ')}`);
  if (stats.deptMiss.size) console.log(`گروه‌های بی‌تطبیق (${stats.deptMiss.size}): ${[...stats.deptMiss].slice(0, 10).join('، ')}`);
  console.log(DRY ? 'DRY-RUN — چیزی نوشته نشد.' : '🎉 کامل شد.');
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  if (err?.code) console.error('   code:', err.code);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

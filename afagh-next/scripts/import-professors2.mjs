#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  بازسازی کامل پروندهٔ اساتید — فقط از «ostadan.txt» (اساتيد.txt سما، ۱۱۳ ستون)
 *
 *  یافته‌های نگاشت (از تطبیق دادهٔ واقعی):
 *  - Code(0) = کد استاد (کلید)؛ Title(1) = «نام‌خانوادگی-نام»
 *  - GroupCode(2) → departments.departmentCode ؛ Daneshkadeh(3) → faculties.facultyCode
 *  - madrak(8) → «مدرک استاد.txt» (Code→Title) ؛ Degree(4) کدگذاری جدا (نادیده)
 *  - Sex: 1=زن 2=مرد (معکوس استاندارد — از تطبیق لقب/جنسیت اساتید2 یاد گرفته شد)
 *  - isActive: 1=True→فعال، 2/False/0→غیرفعال
 *  - RESHTE(33): کد رشته (→ رشته ها.txt) یا نام مستقیم → fieldMain
 *  - CourseStudyTitle(78) → fieldOfStudy ؛ PositionTitle(73) → staffType
 *  - NationalCode(60) وگرنه IDNO(35) اگر ۱۰رقمی
 *  - سطرهای تکه‌شدهٔ باینری عکس (ستون pic) با شرط cols>=100 حذف می‌شوند؛
 *    تکراری‌های Code با غنی‌ترین سطر ادغام می‌شود (dedupe).
 *
 *  استفاده:
 *    node scripts/import-professors2.mjs --dir "E:\git\information afagh" --dry
 *    node scripts/import-professors2.mjs --dir ... --limit 20 --dry
 *    node scripts/import-professors2.mjs --dir ...                     # اجرای واقعی
 *    node scripts/import-professors2.mjs --dir ... --no-purge          # بدون حذف دمو
 *    node scripts/import-professors2.mjs --dir ... --keep-demo SCT-PF01
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
const DIR = args.dir || (existsSync('/data/ostadan.txt') ? '/data' : 'E:\\git\\information afagh');
function findInDir(dir, test) {
  try {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      try { if (!statSync(p).isFile() || !/\.txt$/i.test(n)) continue; } catch { continue; }
      if (test(n.replace(/\.txt$/i, ''))) return p;
    }
  } catch {}
  return null;
}
function resolveFile() {
  if (args.file) return args.file;
  return findInDir(DIR, b => /ostadan/i.test(b) || /اساتيد|اساتید/.test(b) && !/2/.test(b))
    || findInDir(DIR, b => /اساتید\s*2|اساتيد\s*2/i.test(b))
    || join(DIR, 'ostadan.txt');
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
  const stream = createReadStream(path, { highWaterMark: 8 * 1024 * 1024 });
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
// Sex سما (اساتید): 1=زن، 2=مرد — معکوس استاندارد، از تطبیق لقب/جنسیت یاد شده
function mapGender(s) {
  const t = clean(s);
  if (t === '2') return 'MALE';
  if (t === '1') return 'FEMALE';
  return null;
}
function mapActive(s) {
  const t = clean(s);
  if (t === '1' || /^true$/i.test(t)) return 1;
  if (t === '2' || t === '0' || /^false$/i.test(t)) return 0;
  return null;
}
function mapMarital(s) {
  const t = clean(s);
  if (t === '1') return { code: 1, title: 'متاهل' };
  if (t === '0') return { code: 0, title: 'مجرد' };
  return { code: /^\d+$/.test(t) ? Number(t) : null, title: null };
}
const PAYEH_RANK = { '1': 'مربی', '2': 'استادیار', '3': 'دانشیار', '4': 'استاد', '5': 'استاد ممتاز' };
const EMP_MAP = { '1': 'رسمی', '2': 'پیمانی', '3': 'حق التدریس', '4': 'مدعو' };
const synthNC = (code) => ('9' + String(code).replace(/\D/g, '').padStart(9, '0')).slice(-10);

// نام «خانوادگی-نام» → [family, name]
function splitTitle(t, c79, c80) {
  let family = norm(c80) || null, first = norm(c79) || null;
  const parts = norm(t).split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2 && (!family || !first)) {
    family = family || parts[0];
    first = first || parts.slice(1).join(' ');
  } else if (parts.length === 1 && !family && !first) {
    family = parts[0];
  }
  return { first: first || family || 'نامشخص', last: family || first || 'نامشخص' };
}

// ── کش‌ها ──
const facultyByName = new Map();
const deptByName = new Map();
const deptByCode = new Map();   // departmentCode -> id
const facultyByCode = new Map();// facultyCode -> id
const degreeByCode = new Map(); // مدرک استاد Code -> Title
const reshteByCode = new Map(); // رشته ها Code -> Title
async function loadCaches() {
  for (const r of await q(`SELECT id, name, "facultyCode" FROM faculties`)) {
    const k = norm(r.name);
    if (k && !facultyByName.has(k)) facultyByName.set(k, Number(r.id));
    if (r.facultyCode) facultyByCode.set(String(r.facultyCode).trim(), Number(r.id));
  }
  for (const r of await q(`SELECT id, name, "facultyId", "departmentCode" FROM departments`)) {
    const k = norm(r.name);
    if (k) {
      if (!deptByName.has(k)) deptByName.set(k, []);
      deptByName.get(k).push({ id: Number(r.id), facultyId: r.facultyId == null ? null : Number(r.facultyId) });
    }
    if (r.departmentCode) deptByCode.set(String(r.departmentCode).trim(), Number(r.id));
  }
  console.log(`کش DB: ${facultyByCode.size} کد دانشکده، ${deptByCode.size} کد گروه`);
}
async function loadRefFile(kind) {
  // kind: 'degree' (مدرک استاد) | 'reshte' (رشته ها) — Code -> Title
  const p = kind === 'degree'
    ? findInDir(DIR, b => /مدرک.*استاد/.test(b))
    : findInDir(DIR, b => /رشته.*ها/.test(b));
  const map = kind === 'degree' ? degreeByCode : reshteByCode;
  if (!p) { console.log(`مرجع ${kind} یافت نشد`); return; }
  for await (const { cols } of tsvRows(p)) {
    const code = clean(cols[0]);
    const title = norm(cols[1]);
    if (/^\d+$/.test(code) && title && title !== 'نامشخص' && !map.has(code)) map.set(code, title.slice(0, 50));
  }
  console.log(`مرجع ${kind}: ${map.size} کد (${p.split(/[\\/]/).pop()})`);
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
  await pool.query(`UPDATE departments SET "headStaffId"=NULL WHERE "headStaffId"=ANY($1)`, [vIds]);
  const offN = (await pool.query(`UPDATE course_offerings SET "professorId"=NULL WHERE "professorId"=ANY($1)`, [vIds])).rowCount;
  const opN = (await pool.query(`DELETE FROM offering_professors WHERE "staffId"=ANY($1)`, [vIds])).rowCount;
  const avN = (await pool.query(`DELETE FROM professor_availabilities WHERE "staffId"=ANY($1)`, [vIds])).rowCount;
  try { await pool.query(`DELETE FROM professor_term_contracts WHERE "staffId"=ANY($1)`, [vIds]); } catch {}
  try { await pool.query(`DELETE FROM grade_submission_otps WHERE "staffId"=ANY($1)`, [vIds]); } catch {}
  await pool.query(`DELETE FROM user_roles WHERE "userId"=ANY($1)`, [vUids]);
  await pool.query(`DELETE FROM sessions WHERE "userId"=ANY($1)`, [vUids]);
  const stN = (await pool.query(`DELETE FROM staff WHERE id=ANY($1)`, [vIds])).rowCount;
  let uN = 0, uKeep = 0;
  for (const uid of vUids) {
    const hasStu = (await q(`SELECT 1 FROM students WHERE "userId"=$1 LIMIT 1`, [uid]))[0];
    if (hasStu) { uKeep++; continue; }
    try { uN += (await pool.query(`DELETE FROM users WHERE id=$1`, [uid])).rowCount; }
    catch { uKeep++; }
  }
  console.log(`  حذف شد: staff=${stN} users=${uN} (نگه‌داشته user=${uKeep}) | آزادسازی: offerings.prof=${offN} offering_profs=${opN} avail=${avN}`);
}

// ── اجرا ──
try {
  console.log(`Professors from ostadan | file=${FILE} | limit=${LIMIT || '∞'} | ${DRY ? 'DRY-RUN' : 'LIVE'} | purge=${PURGE ? 'ON' : 'OFF'}`);
  // پاس ۱: جمع‌آوری غنی‌ترین سطر هر کد (حذف تکه‌های باینری و تکراری‌ها)
  const best = new Map(); // code -> {score, cols}
  let scanned = 0, frag = 0;
  for await (const { cols } of tsvRows(FILE)) {
    scanned++;
    if (cols.length < 100) { frag++; continue; }
    const code = clean(cols[0]);
    const title = clean(cols[1]);
    if (!/^\d+$/.test(code) || code === '0' || !title || title.length < 2) continue;
    let score = 0;
    for (const v of cols) if (clean(v) !== '') score++;
    const prev = best.get(code);
    if (!prev || score > prev.score) best.set(code, { score, cols });
    if (LIMIT && best.size >= LIMIT) break;
  }
  console.log(`اسکن: ${scanned} سطر فیزیکی، ${frag} تکهٔ باینری رد شد → ${best.size} استاد یکتا`);
  if (DRY && !PURGE) {
    let i = 0;
    for (const [code, r] of best) {
      if (i++ >= 8) break;
      const c = r.cols;
      console.log(`[DRY] code=${code} title=${norm(c[1]).slice(0, 40)} | grp=${clean(c[2])} fac=${clean(c[3])} | NC=${clean(c[60]) || clean(c[35])} | sex=${clean(c[43])}`);
    }
  }
  if (!DRY) {
    if (PURGE) await purgeDemos();
    await loadCaches();
    await loadRefFile('degree');
    await loadRefFile('reshte');
  }
  let profRoleId = null;
  if (!DRY) profRoleId = (await q(`SELECT id FROM roles WHERE code='PROFESSOR'`))[0]?.id ?? null;

  const stats = { total: 0, createdUser: 0, updatedUser: 0, createdStaff: 0, updatedStaff: 0, grpMiss: new Set(), facMiss: new Set(), ncFallback: 0, degMiss: new Set() };
  for (const [code, r] of best) {
    const c = r.cols;
    if (LIMIT && stats.total >= LIMIT) break;
    stats.total++;
    const { first, last } = splitTitle(c[1], c[79], c[80]);
    // گروه/دانشکده از روی کد
    const grpCode = /^\d+$/.test(clean(c[2])) ? clean(c[2]) : null;
    const facCode = /^\d+$/.test(clean(c[3])) ? clean(c[3]) : null;
    let deptId = (grpCode && deptByCode.get(grpCode)) ?? null;
    if (grpCode && deptId == null) stats.grpMiss.add(grpCode);
    let facultyId = (facCode && facultyByCode.get(facCode)) ?? null;
    if (facCode && facultyId == null) {
      if (!DRY) {
        const ins = (await q(`INSERT INTO faculties (name, "facultyCode") VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, [`دانشکده ${facCode} (سما)`, facCode]))[0]
          || (await q(`SELECT id FROM faculties WHERE "facultyCode"=$1`, [facCode]))[0];
        if (ins) { facultyId = Number(ins.id); facultyByCode.set(facCode, facultyId); }
      }
      if (facultyId == null) stats.facMiss.add(facCode);
    }
    // مدرک از madrak(8) با مرجع
    const madrak = clean(c[8]);
    let degree = null;
    if (/^\d+$/.test(madrak)) {
      degree = degreeByCode.get(madrak) || null;
      if (!degree) stats.degMiss.add(madrak);
    } else if (madrak && !/^(false|true|0)$/i.test(madrak)) degree = norm(madrak).slice(0, 50);
    // رشته از RESHTE(33): کد → رشته ها، یا نام مستقیم
    const reshte = clean(c[33]);
    let fieldMain = null;
    if (/^\d+$/.test(reshte) && reshte !== '0') fieldMain = (reshteByCode.get(reshte) || null);
    else if (reshte && !/^(false|true|0)$/i.test(reshte)) fieldMain = norm(reshte).slice(0, 200);
    if (fieldMain && fieldMain.length > 200) fieldMain = fieldMain.slice(0, 200);
    const empRaw = clean(c[5]);
    const employment = EMP_MAP[empRaw] || (/^[\u0600-\u06FF]/.test(empRaw) ? norm(empRaw).slice(0, 50) : null);
    const coop = norm(c[9]) && /^[12]$/.test(clean(c[9])) ? null : null; // TimeStat کدگذاری نامشخص — نادیده
    const active = mapActive(c[6]);
    const payeh = /^\d+$/.test(clean(c[53])) ? clean(c[53]) : null;
    const rank = (payeh && PAYEH_RANK[payeh]) || null;
    const marital = mapMarital(c[49]);
    const ncRaw = clean(c[60]);
    const idno = clean(c[35]);
    let nc = /^\d{10}$/.test(ncRaw) ? ncRaw : (/^\d{10}$/.test(idno) ? idno : null);
    if (!nc) { nc = synthNC(code); stats.ncFallback++; }
    const personnel = clean(c[55]) || clean(c[81]) || null;
    const bankAcc = clean(c[54]) || clean(c[74]) || null;
    const hireDate = /^\d{4}\/\d{1,2}\/\d{1,2}/.test(clean(c[7])) ? clean(c[7]).slice(0, 10) : null;
    const father = norm(c[34]) || norm(c[97]) || null;
    if (DRY) continue;
    // ── کاربر ──
    const clash = (await q(`SELECT id FROM users WHERE "nationalCode"=$1`, [nc]))[0];
    let userId;
    if (clash) {
      userId = clash.id;
      const owner = (await q(`SELECT id FROM staff WHERE "userId"=$1 AND "staffCode"<>$2 LIMIT 1`, [userId, code]))[0];
      if (owner) { nc = synthNC(code); stats.ncFallback++; }
    }
    const u = (await q(`SELECT id FROM users WHERE "nationalCode"=$1`, [nc]))[0];
    const mobile = normMobile(c[46]);
    const email = /@/.test(clean(c[48])) ? clean(c[48]).slice(0, 150) : null;
    const birthDate = faDate(c[36]);
    if (u) {
      userId = u.id;
      await pool.query(`UPDATE users SET "firstName"=$2,"lastName"=$3,mobile=COALESCE($4,mobile),email=COALESCE($5,email),
        "birthCertNo"=COALESCE($6,"birthCertNo"),"birthDate"=COALESCE($7,"birthDate"),"fatherName"=COALESCE($8,"fatherName"),
        gender=COALESCE($9,gender),address=COALESCE($10,address),"placeOfBirth"=COALESCE($11,"placeOfBirth"),
        "placeOfIssue"=COALESCE($12,"placeOfIssue"),"firstNameEn"=COALESCE($13,"firstNameEn"),"lastNameEn"=COALESCE($14,"lastNameEn"),"isActive"=1 WHERE id=$1`,
        [userId, first.slice(0, 100), last.slice(0, 100), mobile, email, clean(c[35]) || null, birthDate, father,
         mapGender(c[43]), norm(c[47]).slice(0, 300) || null, norm(c[37]) || null, norm(c[38]) || null,
         norm(c[102]) || null, norm(c[103]) || null]);
      stats.updatedUser++;
    } else {
      const ins = (await pool.query(`INSERT INTO users ("nationalCode","firstName","lastName",mobile,email,"birthCertNo","birthDate",
          "fatherName",gender,address,"placeOfBirth","placeOfIssue","firstNameEn","lastNameEn","passwordHash","isActive","mustChangePassword")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,1) RETURNING id`,
        [nc, first.slice(0, 100), last.slice(0, 100), mobile, email, clean(c[35]) || null, birthDate, father,
         mapGender(c[43]), norm(c[47]).slice(0, 300) || null, norm(c[37]) || null, norm(c[38]) || null,
         norm(c[102]) || null, norm(c[103]) || null, 'MIGRATED:' + code]))[0];
      userId = ins.id;
      stats.createdUser++;
    }
    // ── پروندهٔ کارمندی: بازنویسی کامل ──
    const fieldStudy = norm(c[78]).slice(0, 200) || null;
    const staffType = norm(c[73]).slice(0, 50) || null;
    const phone = clean(c[44]).slice(0, 20) || null;
    const ex = (await q(`SELECT id FROM staff WHERE "staffCode"=$1`, [code]))[0];
    if (ex) {
      await pool.query(`UPDATE staff SET "userId"=$2,"facultyId"=COALESCE($3,"facultyId"),"departmentId"=COALESCE($4,"departmentId"),
        "isActive"=COALESCE($5,"isActive",1),"staffType"=COALESCE($6,"staffType"),degree=COALESCE($7,degree),
        "personnelNo"=COALESCE($8,"personnelNo"),"employmentType"=COALESCE($9,"employmentType"),
        "academicRank"=COALESCE($10,"academicRank"),"hireDate"=COALESCE($11,"hireDate"),
        "fieldOfStudy"=COALESCE($12,"fieldOfStudy"),"fieldMain"=COALESCE($13,"fieldMain"),
        "maritalStatusCode"=COALESCE($14,"maritalStatusCode"),"maritalStatus"=COALESCE($15,"maritalStatus"),
        "academicBase"=COALESCE($16,"academicBase"),"bankAccountNo"=COALESCE($17,"bankAccountNo"),
        phone=COALESCE($18,phone) WHERE id=$1`,
        [ex.id, userId, facultyId, deptId, active, staffType, degree, personnel, employment, rank, hireDate,
         fieldStudy, fieldMain, marital.code, marital.title, payeh, bankAcc, phone]);
      stats.updatedStaff++;
    } else {
      await pool.query(`INSERT INTO staff ("userId","staffCode","facultyId","departmentId","isActive","staffType",
          degree,"personnelNo","employmentType","academicRank","hireDate","fieldOfStudy","fieldMain",
          "maritalStatusCode","maritalStatus","academicBase","bankAccountNo",phone)
        VALUES ($1,$2,$3,$4,COALESCE($5,1),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [userId, code, facultyId, deptId, active, staffType, degree, personnel, employment, rank, hireDate,
         fieldStudy, fieldMain, marital.code, marital.title, payeh, bankAcc, phone]);
      stats.createdStaff++;
    }
    if (profRoleId) {
      await pool.query(`INSERT INTO user_roles ("userId","roleId") VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, profRoleId]);
    }
    if (stats.total % 200 === 0) console.log(`  … ${stats.total} (staff +${stats.createdStaff}/~${stats.updatedStaff})`);
  }
  console.log(`\nاساتید (ostadan): total=${stats.total} | users +${stats.createdUser}/~${stats.updatedUser} | staff +${stats.createdStaff}/~${stats.updatedStaff} | کدملی مصنوعی=${stats.ncFallback}`);
  if (stats.grpMiss.size) console.log(`کدهای گروه بی‌تطبیق (${stats.grpMiss.size}): ${[...stats.grpMiss].slice(0, 10).join('، ')}`);
  if (stats.facMiss.size) console.log(`کدهای دانشکده بی‌تطبیق: ${[...stats.facMiss].slice(0, 10).join('، ')}`);
  if (stats.degMiss.size) console.log(`کدهای مدرک بی‌تطبیق: ${[...stats.degMiss].slice(0, 10).join('، ')}`);
  console.log(DRY ? 'DRY-RUN — چیزی نوشته نشد.' : '🎉 کامل شد.');
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  if (err?.code) console.error('   code:', err.code);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  جایگزینی کد ملی مصنوعی + تاریخ تولد اشتباه اساتید با مقدار واقعی فایل‌ها
 *  + نام واقعی دانشکده‌ها از روی کد (دانشکده.txt) + اتصال گروه‌های بی‌گروه
 *
 *  منابع (فقط واقعی، بدون پیش‌فرض):
 *   - ostadan.txt: col31 NationalCode، col12 BIRTHDATE، col2 GroupCode، col3 Daneshkadeh
 *   - اساتید2.txt: col26 كد ملي، col18 تاريخ تولد، col6 گروه (نام)، fallback وقتی ostadan ندارد
 *   - دانشکده.txt: کد → عنوان (نام دانشکده از روی کد)
 *
 *  سیاست:
 *   - کد ملی: اگر فایل ۱۰رقمی دارد و با DB فرق دارد → جایگزین (به‌شرط عدم تداخل یکتایی؛ تداخل لاگ می‌شود)
 *   - تولد: اگر فایل تاریخ معتبر دارد و DB خالی/متفاوت است → جایگزین (در تعارض دو فایل، ostadan ملاک)
 *   - نام دانشکده: از روی facultyCode از دانشکده.txt (فقط وقتی فرق دارد)
 *   - گروه خالی (GroupCode=0): تطبیق با نام گروه اساتید2 در همان دانشکده (فقط خالی‌ها)
 *
 *  استفاده:
 *    node scripts/fix-professors-nc.mjs --dir /data --uni 1            # خشک
 *    node scripts/fix-professors-nc.mjs --dir /data --uni 1 --apply     # واقعی
 * ══════════════════════════════════════════════════════════════════════
 */
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const DIR = args.dir || '/data';
const UNI = args.uni ? Number(args.uni) : 1;
const APPLY = args.apply === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const pool = new Pool({ connectionString: dbUrl, max: 5 });
const q = async (text, params) => (await pool.query(text, params)).rows;

const dec1256 = new TextDecoder('windows-1256');
async function* tsvRows(path) {
  const stream = createReadStream(path, { highWaterMark: 8 * 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let header = null;
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
        yield { header, cols };
      }
    }
    carry = buf.subarray(start);
  }
}
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
const clean = (s) => String(s ?? '').replace(/\x00/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه');
const isNC10 = (s) => /^\d{10}$/.test(clean(s));
const isJDate = (s) => /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.test(clean(s));
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
function faDateStr(s) {
  const m = clean(s).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1300 || y > 1450 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const g = jalaliToGregorian(y, mo, d);
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
}

try {
  const ostadan = findInDir(DIR, b => /^ostadan$/i.test(b)) || findInDir(DIR, b => /ostadan/i.test(b));
  const rank2 = findInDir(DIR, b => /اساتید2/.test(b));
  if (!ostadan) throw new Error('ostadan.txt یافت نشد');
  console.log(`ostadan: ${ostadan.split(/[\\/]/).pop()} | rank2: ${rank2 ? rank2.split(/[\\/]/).pop() : '—'} | uni=${UNI} | ${APPLY ? 'LIVE' : 'DRY'}`);

  // ── خواندن ostadan (غنی‌ترین سطر هر کد) ──
  const O = new Map(); // code -> {nc, bd, grp, fac}
  for await (const { cols } of tsvRows(ostadan)) {
    if (cols.length < 60) continue;
    const code = clean(cols[0]);
    if (!/^\d+$/.test(code) || code === '0') continue;
    let score = 0;
    for (const v of cols) if (clean(v) !== '') score++;
    const prev = O.get(code);
    if (prev && prev.score >= score) continue;
    O.set(code, {
      score,
      nc: isNC10(cols[31]) ? clean(cols[31]) : null,
      bd: isJDate(cols[12]) ? faDateStr(cols[12]) : null,
      grp: /^\d+$/.test(clean(cols[2])) ? clean(cols[2]) : null,
      fac: /^\d+$/.test(clean(cols[3])) ? clean(cols[3]) : null,
    });
  }
  console.log(`ostadan: ${O.size} کد یکتا`);

  // ── خواندن اساتید2 (fallback) ──
  const R = new Map(); // code -> {nc, bd, grpName}
  if (rank2) {
    for await (const { cols } of tsvRows(rank2)) {
      const code = clean(cols[0]);
      if (!/^\d+$/.test(code) || code === '0' || R.has(code)) continue;
      R.set(code, {
        nc: isNC10(cols[26]) ? clean(cols[26]) : null,
        bd: isJDate(cols[18]) ? faDateStr(cols[18]) : null,
        grpName: norm(cols[6]) || null,
      });
    }
    console.log(`rank2: ${R.size} کد یکتا`);
  }

  // ── دانشکده.txt: کد → عنوان ──
  const facTitles = new Map();
  const facFile = findInDir(DIR, b => /دانشکده/.test(b));
  if (facFile) {
    for await (const { cols } of tsvRows(facFile)) {
      const code = clean(cols[0]);
      const title = norm(cols[1]);
      if (/^\d+$/.test(code) && title && title !== 'نامشخص' && !facTitles.has(code)) facTitles.set(code, title.slice(0, 100));
    }
    console.log(`دانشکده.txt: ${facTitles.size} کد`);
  }

  // ── DB ──
  const staffRows = await q(`SELECT s.id, s."staffCode", s."facultyId", s."departmentId",
      u.id AS "userId", u."nationalCode", u."birthDate", u."firstName", u."lastName"
    FROM staff s JOIN users u ON u.id = s."userId" WHERE s."universityId" = $1`, [UNI]);
  console.log(`DB staff: ${staffRows.length}`);
  const ncOwner = new Map((await q(`SELECT id, "nationalCode" FROM users WHERE "nationalCode" IS NOT NULL`)).map(r => [r.nationalCode, r.id]));
  const deptByCode = new Map((await q(`SELECT id, "departmentCode", "facultyId", name FROM departments WHERE "universityId"=$1 AND "departmentCode" IS NOT NULL`, [UNI])).map(r => [String(r.departmentCode).trim(), r]));
  const deptByName = new Map();
  for (const r of await q(`SELECT id, name, "facultyId" FROM departments WHERE "universityId"=$1`, [UNI])) {
    const k = norm(r.name);
    if (k && !deptByName.has(k)) deptByName.set(k, []);
    if (k) deptByName.get(k).push(r);
  }

  const stats = { ncReplaced: 0, ncClash: 0, ncNoFile: 0, bdReplaced: 0, bdNoFile: 0, facRenamed: 0, deptLinked: 0, deptMiss: 0, noFile: 0 };
  const show = [];
  const facRenamePlan = [];
  if (facTitles.size) {
    const facs = await q(`SELECT id, name, "facultyCode" FROM faculties WHERE "universityId"=$1`, [UNI]);
    for (const f of facs) {
      const want = f.facultyCode != null ? facTitles.get(String(f.facultyCode).trim()) : null;
      if (want && norm(f.name) !== want) facRenamePlan.push({ id: f.id, from: f.name, to: want, code: f.facultyCode });
    }
  }

  for (const st of staffRows) {
    const code = String(st.staffCode).trim();
    const o = O.get(code);
    const r = R.get(code);
    if (!o && !r) { stats.noFile++; continue; }
    const fileNC = o?.nc || r?.nc || null;
    const fileBD = o?.bd || r?.bd || null; // تعارض: ostadan ملاک (۱ مورد شناخته‌شده)

    // کد ملی
    if (fileNC && st.nationalCode !== fileNC) {
      const owner = ncOwner.get(fileNC);
      if (owner && owner !== st.userId) { stats.ncClash++; if (show.length < 15) show.push(`${code}: NC clash ${fileNC} (user ${owner}) — رد شد`); }
      else {
        stats.ncReplaced++;
        if (show.length < 15) show.push(`${code}: NC ${st.nationalCode} → ${fileNC}`);
        if (APPLY) {
          await pool.query(`UPDATE users SET "nationalCode"=$2 WHERE id=$1`, [st.userId, fileNC]);
          ncOwner.delete(st.nationalCode); ncOwner.set(fileNC, st.userId);
        }
      }
    } else if (!fileNC && /^S/i.test(st.nationalCode || '')) stats.ncNoFile++;

    // تولد
    const dbBD = st.birthDate ? new Date(st.birthDate).toISOString().slice(0, 10) : null;
    if (fileBD && dbBD !== fileBD) {
      stats.bdReplaced++;
      if (show.length < 25) show.push(`${code}: BD ${dbBD || '—'} → ${fileBD}`);
      if (APPLY) await pool.query(`UPDATE users SET "birthDate"=$2 WHERE id=$1`, [st.userId, fileBD]);
    } else if (!fileBD && !dbBD) stats.bdNoFile++;

    // گروه خالی → تطبیق نامی با گروه اساتید2
    if ((st.departmentId == null) && r?.grpName) {
      const cands = (deptByName.get(r.grpName) || []).filter(d => st.facultyId == null || d.facultyId === st.facultyId);
      if (cands.length === 1) {
        stats.deptLinked++;
        if (show.length < 30) show.push(`${code}: dept → ${cands[0].name} (id ${cands[0].id})`);
        if (APPLY) await pool.query(`UPDATE staff SET "departmentId"=$2 WHERE id=$1`, [st.id, cands[0].id]);
      } else stats.deptMiss++;
    }
  }

  // rename faculties
  for (const p of facRenamePlan) {
    stats.facRenamed++;
    if (APPLY) await pool.query(`UPDATE faculties SET name=$2 WHERE id=$1`, [p.id, p.to]);
  }

  console.log(`\n── نمونه تغییرات ( ${show.length} ) ──`);
  for (const s of show) console.log('  ' + s);
  console.log(`\nخلاصه (uni ${UNI}): NC جایگزین=${stats.ncReplaced} تداخل=${stats.ncClash} بدون‌فایل=${stats.ncNoFile} | تولد جایگزین=${stats.bdReplaced} بدون‌فایل=${stats.bdNoFile} | دانشکده rename=${stats.facRenamed} | گروه لینک=${stats.deptLinked} miss=${stats.deptMiss} | بی‌فایل=${stats.noFile}` + (APPLY ? ' | ✅ اعمال شد' : ' | (خشک)'));
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

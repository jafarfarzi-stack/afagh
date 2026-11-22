#!/usr/bin/env node
/**
 * create-missing-students — ساختِ دانشجویانی که فقط در UEMS هستند.
 *
 * چرا: همگام‌سازی هفتگی (weekly-uems-sync / migrate-legacy-students) عمداً
 * دانشجوی تازه نمی‌سازد و «تصمیم ایجاد» را به ماژول پذیرش می‌سپارد. در عمل
 * ورودی‌های تازه هر هفته عقب می‌افتند. این اسکریپت همان شکاف را با نگاشتِ
 * صریحِ کدهای سما پر می‌کند:
 *
 *   MAGHTA  → degree_level_configs.code = 'SAMA-<MAGHTA>'
 *   RESHTE  → majors."majorCode" = <RESHTE> AND "degreeLevelId" = <درجه>
 *   TERMCODE→ entryYear = floor(/10) ، entryTerm = %10
 *
 * پیش‌فرض: **dry-run** (هیچ نوشتنی). برای نوشتن: --apply --backup <file.jsonl>
 */
import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { mapSamaStatus } from './lib/student-status-map.mjs';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    args[k] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const APPLY = args.apply === 'true';
const UNI = Number(args.uni || 1);
const DIR = args.dir;
const DB_ENV = args['db-env'] || '/root/afagh/.env';
const DB_HOST = args['db-host'] || '172.20.0.5';
const BACKUP = args.backup || '';
const ONLY_STATUS = String(args.status || '').trim().toUpperCase();

if (!DIR) { console.error('--dir لازم است'); process.exit(2); }
if (APPLY && !BACKUP) { console.error('❌ --apply بدون --backup مجاز نیست.'); process.exit(2); }

const req = createRequire(import.meta.url);
const { Pool } = req('pg');
const envTxt = readFileSync(DB_ENV, 'utf8');
const m = envTxt.match(/^POSTGRES_PASSWORD=(.*)$/m);
if (!m) { console.error('POSTGRES_PASSWORD یافت نشد'); process.exit(2); }
const pool = new Pool({ host: DB_HOST, port: 5432, user: 'afagh', password: m[1].replace(/\r$/, ''), database: 'afagh_db', max: 5 });
const q = async (t, p) => (await pool.query(t, p)).rows;

const hashDefault = (pw) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex')}`;
};
const oneTime = () => randomBytes(18).toString('base64url').slice(0, 24);

function readTsv(name) {
  let p = join(DIR, name);
  if (!existsSync(p)) p = join(DIR, name + '.tsv');
  if (!existsSync(p)) return { header: [], rows: [] };
  const lines = readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map((l) => {
    const c = l.split('\t');
    const o = {};
    header.forEach((h, i) => { o[h] = c[i]; });
    return o;
  });
  return { header, rows };
}

const norm = (s) => String(s ?? '').replace(/\u200c/g, '').trim().toLowerCase();
const digits = (s) => String(s ?? '').replace(/[^\d]/g, '');

/** «نام‌خانوادگی-نام» سما → {last, first} */
function splitName(v) {
  const s = String(v ?? '').trim();
  if (!s || s === 'NULL') return null;
  const i = s.indexOf('-');
  if (i <= 0) return { last: s, first: '' };
  return { last: s.slice(0, i).trim(), first: s.slice(i + 1).trim() };
}

/** تاریخ ۱۳۷۸/۰۹/۱۷ → Date (میلادی) */
function jalaliToDate(v) {
  const s = String(v ?? '').trim();
  const mm = s.match(/^(\d{3,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!mm) return null;
  let jy = Number(mm[1]); if (jy < 100) jy += 1300;
  const jm = Number(mm[2]), jd = Number(mm[3]);
  if (!jy || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const g = jalaliToGregorian(jy, jm, jd);
  return g ? new Date(Date.UTC(g[0], g[1] - 1, g[2])) : null;
}
function jalaliToGregorian(jy, jm, jd) {
  let gy = jy > 979 ? 1600 : 621;
  const y = jy > 979 ? jy - 979 : jy;
  let days = 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + 78 + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const ml = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > ml[gm]) { gd -= ml[gm]; gm++; }
  return [gy, gm, gd];
}


async function main() {
  const uni = (await q('select id, code, title from universities where id=$1', [UNI]))[0];
  console.log(`university: ${uni?.code} ${uni?.title}  apply=${APPLY}`);

  const { rows } = readTsv('MAININFO_students.tsv');
  console.log(`منبع: ${rows.length} ردیف`);

  const dbCodes = new Set((await q('select "studentCode" from students where "universityId"=$1', [UNI])).map((r) => String(r.studentCode)));
  const degRows = await q(`select id, code, title from degree_level_configs where "universityId"=$1 or "universityId" is null`, [UNI]);
  const degBySama = new Map();
  for (const d of degRows) {
    const mm = String(d.code || '').match(/^SAMA-(\d+)$/i);
    if (mm) degBySama.set(mm[1], d);
  }
  const majorRows = await q('select id, "majorCode", name, "degreeLevelId" from majors where "universityId"=$1', [UNI]);
  const majorMap = new Map();
  for (const mj of majorRows) majorMap.set(`${String(mj.majorCode).trim()}|${mj.degreeLevelId}`, mj);
  const regRows = await q('select id, "degreeLevelId", "effectiveFromYear", "effectiveToYear" from educational_regulations where "universityId"=$1 or "universityId" is null', [UNI]);

  const statusCount = {};
  const stats = { total: 0, already: 0, ready: 0, noDegree: 0, noMajor: 0, noReg: 0, badCode: 0, badName: 0, badNational: 0, badStatus: 0, dupNational: 0, created: 0 };
  const samples = { noMajor: [], noDegree: [], badNational: [] };
  const ready = [];

  const nationalSeen = new Map();
  for (const r of rows) {
    const code = digits(r.STNO);
    if (!code || code.length > 14) { stats.badCode++; continue; }
    if (dbCodes.has(code)) { stats.already++; continue; }
    stats.total++;

    const name = splitName(r.NAME);
    if (!name || !name.last) { stats.badName++; continue; }

    const status = mapSamaStatus(r.STATUS, 'AFAGH');
    if (!status) { stats.badStatus++; continue; }
    if (ONLY_STATUS && status !== ONLY_STATUS) { stats.skippedByStatus = (stats.skippedByStatus || 0) + 1; continue; }

    const deg = degBySama.get(String(r.MAGHTA).trim());
    if (!deg) { stats.noDegree++; if (samples.noDegree.length < 8) samples.noDegree.push(`${code} MAGHTA=${r.MAGHTA}`); continue; }

    const major = majorMap.get(`${String(r.RESHTE).trim()}|${deg.id}`) || null;
    if (!major) { stats.noMajor++; if (samples.noMajor.length < 10) samples.noMajor.push(`${code} RESHTE=${r.RESHTE} deg=${deg.code}`); continue; }

    const term = String(r.TERMCODE || '').trim();
    const entryYear = term.length === 5 ? Number(term.slice(0, 4)) : null;
    const entryTerm = term.length === 5 ? Number(term.slice(4)) : 1;

    // مقاطعی مثل SAMA-2 (کارشناسی) و SAMA-9 (کاردانی پیوسته) آیین‌نامهٔ
    // اختصاصی ندارند؛ آیین‌نامهٔ ۱۴۰۲ «کاردانی و کارشناسی» (SAMA-1) پوشششان
    // می‌دهد. بدون این fallback، ۶۷۷ نفر ساخته نمی‌شدند.
    // کلید = بخشِ عددیِ MAGHTA (چون degBySama با عدد کلید می‌خورد)
    const REG_FALLBACK = { '2': '1', '9': '1', '0': '1', '13': '1', '10': '1', '11': '1' };
    const regDegId = regRows.some((g) => g.degreeLevelId === deg.id)
      ? deg.id
      : (degBySama.get(REG_FALLBACK[String(deg.code).replace(/^SAMA-/i, '')] || '')?.id ?? deg.id);
    const reg = regRows
      .filter((g) => g.degreeLevelId === regDegId)
      .filter((g) => Number(g.effectiveFromYear) <= (entryYear ?? 0) && (g.effectiveToYear == null || Number(g.effectiveToYear) >= (entryYear ?? 0)))
      .sort((a, b) => Number(b.effectiveFromYear) - Number(a.effectiveFromYear))[0]
      || regRows.filter((g) => g.degreeLevelId === regDegId)[0];
    if (!reg) { stats.noReg++; continue; }

    const nc = digits(r.IDNO);
    if (nc.length !== 10) { stats.badNational++; if (samples.badNational.length < 8) samples.badNational.push(`${code} IDNO=${r.IDNO}`); continue; }
    if (nationalSeen.has(nc)) { stats.dupNational++; continue; }
    nationalSeen.set(nc, code);

    ready.push({
      code, nationalCode: nc, lastName: name.last, firstName: name.first,
      fatherName: String(r.NAMEP || '').trim() || null,
      birthDate: jalaliToDate(r.BIRTHDATE),
      gender: String(r.SEX).trim() === '2' ? 'FEMALE' : 'MALE',
      majorId: major.id, degreeLevelId: deg.id, regulationId: reg.id,
      entryYear, entryTerm, status,
    });
    stats.ready++;
    statusCount[status] = (statusCount[status] || 0) + 1;
  }

  console.log('\n── خلاصه ──');
  console.log(JSON.stringify(stats, null, 2));
  console.log('تفکیک وضعیتِ آمادهٔ ساخت:', statusCount);
  if (samples.noMajor.length) console.log('نمونهٔ رشتهٔ نامطابق:', samples.noMajor);
  if (samples.noDegree.length) console.log('نمونهٔ مقطعٔ نامطابق:', samples.noDegree);
  if (samples.badNational.length) console.log('نمونهٔ کد ملی نامعتبر:', samples.badNational);

  if (!APPLY) {
    console.log('\n*** DRY: هیچ چیزی نوشته نشد. برای اعمال: --apply --backup <file> ***');
    await pool.end();
    return;
  }

  writeFileSync(BACKUP, '');
  let created = 0;
  for (const s of ready) {
    try {
      const pw = oneTime();
      await pool.query('begin');
      // users."nationalCode" ایندکس یکتا ندارد (فقط ایندکس ساده) → ON CONFLICT
      // کار نمی‌کند؛ اول جست‌وجو، بعد درج.
      const ex = (await pool.query('select id from users where "nationalCode"=$1 limit 1', [s.nationalCode])).rows[0];
      let userId = ex?.id;
      if (!userId) {
        const u = (await pool.query(
          `insert into users ("nationalCode","firstName","lastName","fatherName","birthDate","gender","passwordHash","mustChangePassword")
           values ($1,$2,$3,$4,$5,$6,$7,1) returning id`,
          [s.nationalCode, s.firstName, s.lastName, s.fatherName, s.birthDate, s.gender, hashDefault(pw)],
        )).rows[0];
        userId = u?.id;
      }
      if (!userId) { await pool.query('rollback'); continue; }
      const st = (await pool.query(
        `insert into students ("userId","studentCode","majorId","degreeLevelId","regulationId","entryYear","entryTerm","status","universityId")
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning id`,
        [userId, s.code, s.majorId, s.degreeLevelId, s.regulationId, s.entryYear, s.entryTerm, s.status, UNI],
      )).rows[0];
      if (!st) { await pool.query('rollback'); continue; }
      await pool.query('commit');
      appendFileSync(BACKUP, JSON.stringify({ studentCode: s.code, studentId: st.id, userId, nationalCode: s.nationalCode }) + '\n');
      created++;
    } catch (e) {
      await pool.query('rollback').catch(() => {});
      console.error('خطا در', s.code, e.message);
    }
  }
  console.log(`\n✅ ساخته شد: ${created} — بکاپ: ${BACKUP}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

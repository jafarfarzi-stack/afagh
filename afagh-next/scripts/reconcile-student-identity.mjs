#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  reconcile-student-identity — تطبیق هویت دانشجویان با دو خروجی قدیمی UEMS
 *
 *  منبعها (cp1256 → UTF-8 توسط اسکناس تبدیل شد):
 *    NAHAIID.tsv        شماره/نام/جنسیت/نام پدر/شناسنامه/تولد/کد ملی/نحوه ورود
 *    identity_extra.tsv استان و شهر محل تولد، محل صدور، شیوهٔ آموزش
 *
 *  کلید: **شمارهٔ دانشجویی دقیقاً همان رشته** (بعضی ۹ یا ۱۱رقمیاند؛ نباید
 *  numberize شوند). دامنه: فقط `"universityId" = $UNI` (پیشفرض ۱).
 *
 *  ایمنی: پیشفرض DRY. نوشتن فقط با --apply + --backup JSONL که `{id,before,after}`
 *  هر ردیف را ثبت میکند؛ --restore برمیگرداند. کد ملی فقط وقتی جایگزین میشود
 *  که ۱۰رقمی باشد و در آفاق تکرار نشدهباشد (users قید یکتایی ندارد).
 *
 *  اجرا داخل کانتینر:
 *    node scripts/reconcile-student-identity.mjs --dir /tmp/identity_sync \
 *      --db-host postgres --db-env /tmp/afagh_db.env --report /tmp/identity_sync/dry.json
 *    ... --apply --backup /tmp/identity_sync/identity-20261123.jsonl
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const A = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    A[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
}
const DIR = A.dir || '/tmp/identity_sync';
const UNI = Number(A.uni || 1);
const APPLY = A.apply === 'true';
const BACKUP = A.backup && A.backup !== 'true' ? A.backup : '';
const RESTORE = A.restore && A.restore !== 'true' ? A.restore : '';
const REPORT = A.report && A.report !== 'true' ? A.report : '';
const DB_ENV = A['db-env'] || '';
const DB_HOST = A['db-host'] || 'postgres';
const DB_PORT = Number(A['db-port'] || 5432);

let password = String(process.env.POSTGRES_PASSWORD || '').trim();
if (!password && DB_ENV && existsSync(DB_ENV)) {
  const m = readFileSync(DB_ENV, 'utf8').match(/^POSTGRES_PASSWORD=(.*)$/m);
  if (m) password = m[1].replace(/\r$/, '');
}
const needPassword = () => { if (!password && !RESTORE) throw new Error('POSTGRES_PASSWORD لازم است'); };

const req = createRequire(import.meta.url);
const pgMod = req('pg');
const Pool = pgMod.Pool || pgMod.default?.Pool;
// ۱۰ اتصال مستقل ⇒ فاز نوشتن روی ۱۰ کارگر موازی (درخواست کاربر)
const PARALLEL = Math.max(1, Math.min(20, Number(A.parallel || 10)));
const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: 'afagh', password, database: 'afagh_db', max: PARALLEL });
const q = async (text, params) => (await pool.query(text, params)).rows;

/** خواندن TSV با هدر فارسی و کلید رشتهای (بدون تبدیل عددی). */
function readTsv(file) {
  const p = join(DIR, file);
  if (!existsSync(p)) throw new Error('not found: ' + p);
  const text = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hdr = lines[0].split('\t').map((h) => h.trim());
  const at = (cols, name) => { const i = hdr.indexOf(name); return i >= 0 ? String(cols[i] ?? '').trim() : ''; };
  const map = new Map();
  let dup = 0;
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const code = at(c, hdr[0]);
    if (!code) continue;
    if (map.has(code)) { dup++; continue; } // fail-closed: اولین ردیف معتبر
    const rec = {};
    for (const h of hdr) rec[h] = at(c, h);
    map.set(code, rec);
  }
  return { map, dup, rows: lines.length - 1 };
}

/**
 * الگوریتم رسمی چکسم کد ملی ایران:
 *   sum(digit[i] * (10-i)) for i=0..8 ; r = sum % 11 ;
 *   check = r<2 ? r : 11-r  ⇒ باید با رقم دهم برابر باشد.
 * تمامارقام یکسان هم رد میشوند.
 */
export function isValidIranianNationalCode(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{10}$/.test(s)) return false;
  if (new Set(s).size === 1) return false;
  const sum = [...s.slice(0, 9)].reduce((acc, ch, i) => acc + Number(ch) * (10 - i), 0);
  const r = sum % 11;
  return (r < 2 ? r : 11 - r) === Number(s[9]);
}

const norm = (v) => String(v ?? '').replace(/[\u200c\u200f\u200e]/g, '').replace(/\s+/g, ' ').trim();
/** نام سما: «نام خانوادگی-نام» ⇒ {firstName,lastName} */
export function parseFullName(raw) {
  const s = norm(raw);
  if (!s) return null;
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  const firstName = parts[parts.length - 1];
  const lastParts = parts.slice(0, -1);
  // «قاسمي دويران-شيوا-شيوا» ⇒ آخرین قسمت تکراری است
  if (lastParts.length > 1 && lastParts[lastParts.length - 1] === firstName) lastParts.pop();
  const lastName = lastParts.join(' ').trim();
  if (!lastName) return null;
  return { firstName, lastName };
}

/** Jalali YYYY/MM/DD (یا فقط YYYY) → Gregorian YYYY-MM-DD */
export function jalaliToGregorianDate(v) {
  const s = norm(v);
  const m = s.match(/^(\d{4})(?:\/(\d{1,2}))?(?:\/(\d{1,2}))?/);
  if (!m) return null;
  const y = +m[1];
  if (y < 1300 || y > 1500) return null;
  const mo = m[2] ? +m[2] : 1;
  const d = m[3] ? +m[3] : 1;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let jy = y + 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + d
    + (mo < 7 ? (mo - 1) * 31 : (mo - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097); days %= 146097;
  if (days > 36524) { days--; gy += 100 * ~~(days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * ~~(days / 1461); days %= 1461;
  if (days > 365) { days -= 366; gy += 1; while (days > 364) { days -= 365; gy += 1; } }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 12 && gd > sal[gm]; gm++) gd -= sal[gm];
  return `${gy}-${String(gm + 1).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

const USER_FIELDS = ['nationalCode', 'firstName', 'lastName', 'fatherName', 'birthCertNo', 'birthDate', 'gender', 'placeOfBirth', 'placeOfIssue'];
const STUDENT_FIELDS = ['acceptanceType', 'trainingMethod'];
// سقف ستونها — منبع قدیمی گاهی عنوان بلندتر دارد ⇒ برش ایمن (نه خطای ۲۲۰۰۱)
const LIMITS = Object.freeze({
  nationalCode: 10, firstName: 100, lastName: 100, fatherName: 100, birthCertNo: 20,
  gender: 10, placeOfBirth: 150, placeOfIssue: 150, acceptanceType: 30, trainingMethod: 20,
});
const clamp = (field, value) => {
  const s = String(value);
  const max = LIMITS[field];
  return max && s.length > max ? s.slice(0, max) : s;
};

function buildIdentity(na, ex) {
  const name = parseFullName(na['نام_و_نام_خانوادگي'] || na['نام_و_نام_خانوادگی']);
  const sexRaw = norm(na['جنسيت']);
  const gender = sexRaw === 'زن' ? 'FEMALE' : sexRaw === 'مرد' ? 'MALE' : null;
  let nc = norm(na['کد_ملي'] || na['کد_ملی']);
  // تأیید کاربر: صفرهای پیشرو هنگام تبدیل به عدد حذف شدهاند؛ کد ۷–۹رقمی
  // با صفر پیشرو به ۱۰ رقم میرسد (480632766 ⇒ 0480632766, 20421893 ⇒ 0020421893).
  if (/^\d{7,9}$/.test(nc)) nc = nc.padStart(10, '0');
  const birthRaw = norm(na['تاريخ_تولد']);
  const province = norm(ex['استان_محل_تولد']);
  const cityRaw = norm(ex['شهر_محل_تولد']);
  const issueRaw = norm(ex['محل_صدور']);
  const isUnknown = (v) => !v || v === 'نامشخص' || v === '-' || v === '0';
  // قاعدهٔ کاربر: اگر شهر تولد نبود/نامشخص بود ⇒ از محل صدور پر کن؛
  // اگر محل صدور هم نبود ⇒ استان را بگیر.
  const city = !isUnknown(cityRaw) ? cityRaw : (!isUnknown(issueRaw) ? issueRaw : (!isUnknown(province) ? province : null));
  const birthPlace = city && !isUnknown(province) && province !== city ? `${province} - ${city}` : (city || null);
  return {
    nationalCode: isValidIranianNationalCode(nc) ? nc : null,
    firstName: name?.firstName || null,
    lastName: name?.lastName || null,
    fatherName: norm(na['نام_پدر']) || null,
    birthCertNo: norm(na['شماره_شناسنامه']) || null,
    birthDate: birthRaw.includes('/') ? jalaliToGregorianDate(birthRaw) : null, // سال فقط ⇒ بازنویسی نکن
    gender,
    placeOfBirth: birthPlace,
    placeOfIssue: !isUnknown(issueRaw) ? issueRaw : null,
    acceptanceType: norm(na['نحوه_ورود_به_دانشگاه'] || ex['نحوه_ورود_به_دانشگاه']) || null,
    trainingMethod: /^\d{1,3}$/.test(norm(ex['کد_شيوه_آموزش'])) ? norm(ex['کد_شيوه_آموزش']) : null,
  };
}

async function main() {
  needPassword();
  if (RESTORE) {
    const recs = readFileSync(RESTORE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    let n = 0;
    for (const r of recs.reverse()) {
      const before = r.before || {};
      const keys = Object.keys(before);
      if (!keys.length) continue;
      const set = keys.map((k, i) => `"${k}"=$${i + 2}`).join(',');
      await q(`UPDATE ${r.table} SET ${set} WHERE id=$1`, [r.id, ...keys.map((k) => before[k])]);
      n++;
    }
    console.log('RESTORE:', n, 'ردیف برگردانده شد');
    await pool.end();
    return;
  }
  if (APPLY && !BACKUP) throw new Error('--apply نیازمند --backup است');

  const na = readTsv('NAHAIID.tsv');
  const ex = readTsv('identity_extra.tsv');
  console.log(`SOURCE: NAHAIID=${na.rows} (dup=${na.dup}) · identity_extra=${ex.rows} (dup=${ex.dup})`);

  const dbRows = await q(`
    SELECT s.id AS sid, s."studentCode", s."userId", s."acceptanceType", s."trainingMethod",
           u.id AS uid, u."nationalCode", u."firstName", u."lastName", u."fatherName",
           u."birthCertNo", u."birthDate"::text AS "birthDate", u.gender,
           u."placeOfBirth", u."placeOfIssue"
    FROM students s JOIN users u ON u.id=s."userId"
    WHERE s."universityId"=$1`, [UNI]);
  console.log(`LIVE: ${dbRows.length} دانشجوی دانشگاه ${UNI}`);

  // کد ملیهایی که در آفاق روی کاربر دیگریاند ⇒ جلوگیری از duplicate
  const taken = new Map();
  for (const r of await q('SELECT id, "nationalCode" FROM users WHERE "nationalCode" IS NOT NULL')) {
    if (!taken.has(r.nationalCode)) taken.set(r.nationalCode, new Set());
    taken.get(r.nationalCode).add(Number(r.id));
  }

  const changes = [];
  const stats = { matched: 0, noSource: 0, nationalCodeSkipped: 0, fields: {} };
  for (const r of dbRows) {
    const code = String(r.studentCode).trim();
    const a = na.map.get(code);
    const b = ex.map.get(code);
    if (!a && !b) { stats.noSource++; continue; }
    stats.matched++;
    const want = buildIdentity(a || {}, b || {});

    const uBefore = {}, uAfter = {};
    for (const f of USER_FIELDS) {
      if (want[f] == null) continue;
      const cur = r[f] == null ? null : String(r[f]).trim();
      const next = clamp(f, String(want[f]).trim());
      if (f === 'nationalCode' && cur !== next) {
        const holders = taken.get(next);
        if (holders && [...holders].some((id) => id !== Number(r.uid))) { stats.nationalCodeSkipped++; continue; }
      }
      if (cur !== next) {
        uBefore[f] = cur;
        uAfter[f] = next;
        stats.fields[f] = (stats.fields[f] || 0) + 1;
      }
    }
    const sBefore = {}, sAfter = {};
    for (const f of STUDENT_FIELDS) {
      if (want[f] == null) continue;
      const cur = r[f] == null ? null : String(r[f]).trim();
      const next = clamp(f, String(want[f]).trim());
      if (cur !== next) { sBefore[f] = cur; sAfter[f] = next; stats.fields[f] = (stats.fields[f] || 0) + 1; }
    }
    if (Object.keys(uAfter).length || Object.keys(sAfter).length) {
      changes.push({ code, uid: Number(r.uid), sid: Number(r.sid), uBefore, uAfter, sBefore, sAfter });
    }
  }
  console.log(`MATCHED=${stats.matched} · NO SOURCE=${stats.noSource} · نویسهٔ ملی ردشده(تکراری)=${stats.nationalCodeSkipped}`);
  console.log('FIELD DIFFS:', JSON.stringify(stats.fields));
  console.log('ROWS TO CHANGE:', changes.length);
  for (const c of changes.slice(0, 12)) console.log('  ', c.code, JSON.stringify({ ...c.uAfter, ...c.sAfter }));
  if (REPORT) writeFileSync(REPORT, JSON.stringify({ stats, changes }, null, 2) + '\n', 'utf8');

  if (!APPLY) { console.log('*** DRY: بدون نوشتن ***'); await pool.end(); return; }
  // ── ۱۰ کارگر موازی: هر کدام یک تکه از تغییرات + بکاپ اختصاصی ────────
  const shards = Array.from({ length: PARALLEL }, () => []);
  changes.forEach((c, i) => shards[i % PARALLEL].push(c));
  const t0 = Date.now();
  const results = await Promise.all(shards.map(async (chunk, idx) => {
    const backupFile = BACKUP.replace(/\.jsonl$/i, '') + `.w${idx}.jsonl`;
    const fd = openSync(backupFile, 'w');
    let n = 0;
    try {
      for (const c of chunk) {
        if (Object.keys(c.uAfter).length) {
          const keys = Object.keys(c.uAfter);
          await q(`UPDATE users SET ${keys.map((k, i) => `"${k}"=$${i + 2}`).join(',')} WHERE id=$1`, [c.uid, ...keys.map((k) => c.uAfter[k])]);
          writeSync(fd, JSON.stringify({ table: 'users', id: c.uid, key: c.code, before: c.uBefore, after: c.uAfter }) + '\n', 'utf8');
          n++;
        }
        if (Object.keys(c.sAfter).length) {
          const keys = Object.keys(c.sAfter);
          await q(`UPDATE students SET ${keys.map((k, i) => `"${k}"=$${i + 2}`).join(',')} WHERE id=$1`, [c.sid, ...keys.map((k) => c.sAfter[k])]);
          writeSync(fd, JSON.stringify({ table: 'students', id: c.sid, key: c.code, before: c.sBefore, after: c.sAfter }) + '\n', 'utf8');
          n++;
        }
      }
    } finally { closeSync(fd); }
    return { worker: idx, rows: chunk.length, writes: n, backup: backupFile };
  }));
  console.log(`APPLY: ${changes.length} پرونده توسط ${PARALLEL} کارگر موازی در ${((Date.now() - t0) / 1000).toFixed(1)}s بهروز شد`);
  for (const r of results) console.log(`  worker-${r.worker}: ${r.rows} ردیف / ${r.writes} نوشتن / ${r.backup}`);
  console.log(`بکاپ=${BACKUP}.w0..w${PARALLEL - 1}.jsonl (برای بازگردانی هر فایل را --restore بدهید)`);
  await pool.end();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error('FATAL', e); try { await pool.end(); } catch { /* ignore */ } process.exit(1); });
}

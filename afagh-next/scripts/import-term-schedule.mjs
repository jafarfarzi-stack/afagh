#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  واردسازی زمان‌بندی نیمسال‌ها از فایل سما (zamanbandi.txt)
 *  — انکودینگ فایل: Windows-1256، جداکننده: تب
 *  — ستون‌ها (۰مبنا): ۰=کد ترم، ۱=تاریخ ترم از، ۲=تاریخ ترم تا،
 *    ۳=انتخاب واحد از، ۴=حذف و اخذ از، ۵=حذف تک‌درس از، ۶=امتحانات از،
 *    ۷=وضعیت (در فایل همیشه خالی — نادیده)، ۸=تاریخ پیش از،
 *    ۹=حذف و اخذ تا، ۱۰=حذف تک‌درس تا، ۱۱=تاریخ پیش تا،
 *    ۱۲=انتخاب واحد تا، ۱۳=امتحانات تا،
 *    ۱۴=ثبت‌نام میهمانی (تابستان) از، ۱۵=ثبت‌نام میهمانی (تابستان) تا
 *  — تاریخ شمسی → میلادی با همان تابع import-sama-afagh (تأییدشده با
 *    لنگرهای نوروز) و همان قرارداد ساعت 08:30 UTC
 *  — فقط سلول‌های پردار فایل روی دیتابیس نوشته می‌شوند؛ سلول خالی یعنی
 *    «دست نزن» (غیرمخرب). ردیف کد ۰ (زبالهٔ سما) رد می‌شود.
 *  — idempotent: اجرای دوباره همان مقادیر را می‌نویسد.
 *
 *  استفاده:
 *    node scripts/import-term-schedule.mjs --file /root/information-afagh/zamanbandi.txt --dry
 *    node scripts/import-term-schedule.mjs --file ... --uni 1
 * ══════════════════════════════════════════════════════════════════════
 */
import { readFileSync, existsSync } from 'node:fs';
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
const FILE = args.file || '/root/information-afagh/zamanbandi.txt';
const UNI = Number(args.uni || 1);
const DRY = args.dry === 'true';
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';

const pool = new Pool({ connectionString: dbUrl, max: 3 });
const q = async (text, params) => (await pool.query(text, params)).rows;

// ── جلالی→میلادی (کپی دقیق import-sama-afagh.mjs — با لنگرهای نوروز تأیید شده) ──
function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + ~~(jy / 33) * 8 + ~~(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * ~~(days / 146097);
  days %= 146097;
  if (days > 36524) { days--; gy += 100 * ~~(days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * ~~(days / 1461);
  days %= 1461;
  if (days > 365) { days -= 366; gy += 1; while (days > 364) { days -= 365; gy += 1; } }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 12 && gd > sal[gm]; gm++) gd -= sal[gm];
  return { gy, gm: gm + 1, gd };
}
// سال کبیسهٔ شمسی = طول سال (فاصلهٔ دو نوروز متوالی) ۳۶۶ روز باشد
function jalLeap(jy) {
  const d = (y) => {
    const g = jalaliToGregorian(y, 1, 1);
    return Date.UTC(g.gy, g.gm - 1, g.gd);
  };
  return Math.round((d(jy + 1) - d(jy)) / 86400000) === 366;
}
const JAL_MDAYS = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
function faDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return { date: null, why: 'bad-format' };
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12) return { date: null, why: 'out-of-range' };
  const ml = JAL_MDAYS.slice();
  if (jalLeap(jy)) ml[11] = 30;
  if (jd < 1 || jd > ml[jm - 1]) return { date: null, why: 'bad-day' };
  const g = jalaliToGregorian(jy, jm, jd);
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 8, 30, 0));
  return isNaN(d.getTime()) ? { date: null, why: 'bad-convert' } : { date: d, why: null };
}

// نگاشت ستون فایل → ستون دیتابیس
const COLMAP = [
  [1, 'startDate'], [2, 'endDate'],
  [3, 'enrollmentStartDate'], [12, 'enrollmentEndDate'],
  [4, 'addDropStartDate'], [9, 'addDropEndDate'],
  [5, 'singleDropStartDate'], [10, 'singleDropEndDate'],
  [6, 'examStartDate'], [13, 'examEndDate'],
  [8, 'preRegStartDate'], [11, 'preRegEndDate'],
  [14, 'guestRegStartDate'], [15, 'guestRegEndDate'],
];

async function main() {
  if (!existsSync(FILE)) { console.error(`فایل یافت نشد: ${FILE}`); process.exit(1); }
  const dec = new TextDecoder('windows-1256');
  const text = dec.decode(readFileSync(FILE)).replace(/^\uFEFF/, '');
  const lines = text.split('\r\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) { console.error('فایل خالی است'); process.exit(1); }
  console.log(`هدر: ${lines[0].split('\t').length} ستون | سطر داده: ${lines.length - 1}`);

  const terms = (await q(`SELECT id, "termCode" FROM academic_terms WHERE "universityId" = $1`, [UNI]));
  const termByCode = new Map(terms.map((t) => [String(t.termCode), t.id]));
  console.log(`ترم‌های دانشگاه ${UNI} در دیتابیس: ${terms.length}`);

  const stats = { rows: 0, skippedZero: 0, unknownCode: [], updated: 0, cells: 0, keptDb: 0, invalid: [] };
  const updates = []; // {id, code, set: {col: Date}}

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    const code = (cells[0] || '').trim();
    if (!code || code === '0') { stats.skippedZero++; continue; }
    const id = termByCode.get(code);
    if (!id) { stats.unknownCode.push(code); continue; }
    stats.rows++;
    const set = {};
    for (const [ci, col] of COLMAP) {
      const rawV = (cells[ci] || '').trim();
      if (!rawV) continue; // سلول خالی = دست نزن
      const { date, why } = faDate(rawV);
      if (!date) { stats.invalid.push({ code, col, val: rawV, why }); continue; }
      set[col] = date;
      stats.cells++;
    }
    if (Object.keys(set).length > 0) updates.push({ id, code, set });
  }

  console.log(`\nسطرهای معتبر فایل: ${stats.rows} | ردشده (کد ۰): ${stats.skippedZero}`);
  console.log(`کدهای فایل که در دیتابیس نیست (${stats.unknownCode.length}): ${stats.unknownCode.slice(0, 20).join(',') || '—'}`);
  console.log(`سلول تاریخ معتبر: ${stats.cells}`);
  console.log(`سلول نامعتبر (${stats.invalid.length}):`);
  for (const v of stats.invalid.slice(0, 20)) console.log(`  ترم ${v.code} ستون ${v.col} مقدار ${v.val} علت ${v.why}`);

  if (DRY) {
    console.log('\n[DRY] بدون نوشتن. نمونهٔ ۵ ترم اول:');
    for (const u of updates.slice(0, 5)) {
      console.log(`  ${u.code}: ` + Object.entries(u.set).map(([k, d]) => `${k}=${d.toISOString().slice(0, 10)}`).join(' '));
    }
    console.log(`\n[DRY] مجموع به‌روزرسانی: ${updates.length} ترم`);
    await pool.end();
    return;
  }

  const cols = [...new Set(updates.flatMap((u) => Object.keys(u.set)))];
  console.log(`\nنوشتن ${updates.length} ترم × ستون‌ها: ${cols.join(',')}`);
  for (const u of updates) {
    const keys = Object.keys(u.set);
    const setSql = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    await pool.query(`UPDATE academic_terms SET ${setSql} WHERE id = $1`, [u.id, ...keys.map((k) => u.set[k])]);
    stats.updated++;
  }
  console.log(`✓ به‌روز شد: ${stats.updated} ترم`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

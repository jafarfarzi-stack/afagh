#!/usr/bin/env node
/**
 * ترمیم نام فارسی اساتید که در ایمپورت قبلی انگلیسی افتاده بود.
 *
 * علت: نسخهٔ قبلی splitTitle در import-professors2.mjs وقتی EnglishFirst/LastName
 * پر بود، Title فارسی («خانوادگی-نام») را نادیده می‌گرفت.
 *
 * روش: ostadan.txt را می‌خواند، نام فارسی را از Title استخراج می‌کند و
 * users.firstName/lastName را برای staffCode متناظر اصلاح می‌کند.
 * نام انگلیسی دست‌نخورده در firstNameEn/lastNameEn می‌ماند.
 *
 * استفاده در سرور:
 *   node scripts/fix-professor-names.mjs --dir "E:\git\information afagh"        # خشک (فقط گزارش)
 *   node scripts/fix-professor-names.mjs --dir ... --apply                        # اجرای واقعی
 *   node scripts/fix-professor-names.mjs --dir ... --apply --limit 50
 */
import { createReadStream } from 'node:fs';
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
const DIR = args.dir || 'E:\\git\\information afagh';
const APPLY = args.apply === 'true';
const LIMIT = args.limit ? Number(args.limit) : 0;
const dbUrl = args.db || process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db';
const pool = new Pool({ connectionString: dbUrl, max: 5 });

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
const clean = (s) => String(s ?? '').replace(/\x00/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه');
const hasFa = (s) => /[\u0600-\u06FF]/.test(String(s || ''));

// همان منطق اصلاح‌شدهٔ import-professors2.mjs
function splitTitleFa(t) {
  const parts = norm(t).split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { first: parts.slice(1).join(' '), last: parts[0] };
  if (parts.length === 1 && parts[0] && parts[0] !== 'نامشخص' && parts[0] !== 'ارزيابي' && hasFa(parts[0])) {
    return { first: parts[0], last: parts[0] };
  }
  return null;
}

try {
  const FILE = join(DIR, 'ostadan.txt');
  const best = new Map();
  let scanned = 0, frag = 0;
  for await (const { cols } of tsvRows(FILE)) {
    scanned++;
    if (cols.length < 60) { frag++; continue; }
    const code = clean(cols[0]);
    if (!/^\d+$/.test(code) || code === '0') continue;
    const fa = splitTitleFa(cols[1]);
    if (!fa) continue;
    let score = 0;
    for (const v of cols) if (clean(v) !== '') score++;
    const prev = best.get(code);
    if (!prev || score > prev.score) best.set(code, fa);
    if (LIMIT && best.size >= LIMIT) break;
  }
  console.log(`اسکن: ${scanned} سطر، ${frag} تکهٔ باینری رد شد → ${best.size} استاد با Title فارسی`);

  let needFix = 0, alreadyOk = 0, noStaff = 0, updated = 0, shown = 0;
  for (const [code, fa] of best) {
    const rows = await pool.query(
      `SELECT u.id, u."firstName", u."lastName" FROM staff s JOIN users u ON u.id = s."userId" WHERE s."staffCode" = $1 LIMIT 1`,
      [code],
    );
    const r = rows.rows[0];
    if (!r) { noStaff++; continue; }
    if (r.firstName === fa.first && r.lastName === fa.last) { alreadyOk++; continue; }
    needFix++;
    if (shown < 15) {
      console.log(`  کد ${code}: «${r.lastName}-${r.firstName}» → «${fa.last}-${fa.first}»`);
      shown++;
    }
    if (APPLY) {
      await pool.query(`UPDATE users SET "firstName" = $2, "lastName" = $3 WHERE id = $1`, [r.id, fa.first.slice(0, 100), fa.last.slice(0, 100)]);
      updated++;
    }
  }
  console.log(`\nخلاصه: نیازمند اصلاح=${needFix} | سالم=${alreadyOk} | بدون پرونده staff=${noStaff}` + (APPLY ? ` | اصلاح شد=${updated}` : ' | (خشک — برای اجرا --apply بدهید)'));
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

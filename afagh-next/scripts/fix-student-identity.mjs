#!/usr/bin/env node
/**
 * ترمیم هویت دانشجویان موجود در DB از روی فایل سما (students1.txt):
 *  ۱) جنسیت معکوس (باگ قبلی: SEX=1 به‌اشتباه MALE و SEX=2 به‌اشتباه FEMALE ثبت شد؛
 *     در سما مثل اساتید 1=زن و 2=مرد است — شاهد: SEX=2 «امين» مذکر، SEX=1 «ليلا» مونث)
 *  ۲) محل تولد/صدور خالی (ستون MS(54) مثل «اروميه» که قبلاً اصلاً مپ نشده بود)
 *  ۳) موبایل خالی (MobileNO(35) بعد CurrentTell(16) بعد TempTellNo(34))
 *
 * فقط فیلدهای خالی/اشتباه پر/اصلاح می‌شوند؛ نام و کدملی دست نمی‌خورد.
 *
 * استفاده در سرور:
 *   node scripts/fix-student-identity.mjs --dir "E:\git\information afagh"          # خشک
 *   node scripts/fix-student-identity.mjs --dir ... --apply                          # واقعی
 *   node scripts/fix-student-identity.mjs --dir ... --apply --limit 500
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
const normTxt = (s) => String(s ?? '').replace(/\x00/g, '').replace(/\s+/g, ' ').trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک');
const normMob = (v) => {
  let d = String(v || '').replace(/\D/g, '');
  if (/^989\d{9}$/.test(d)) d = '0' + d.slice(3);
  else if (/^9\d{9}$/.test(d)) d = '0' + d;
  return /^\d{10,11}$/.test(d) ? d : null;
};

try {
  const want = new Map(); // stno -> {gender, place, mobile}
  for (const f of ['students1.txt', 'student2.txt']) {
    try {
      for await (const { cols } of tsvRows(join(DIR, f))) {
        const stno = (cols[0] || '').trim();
        if (!/^\d{7,14}$/.test(stno)) continue;
        if (f === 'students1.txt') {
          const sex = (cols[3] || '').trim();
          const gender = sex === '1' ? 'FEMALE' : sex === '2' ? 'MALE' : null;
          const place = normTxt(cols[54]).slice(0, 150) || null;
          const e = want.get(stno) || {};
          if (gender) e.gender = gender;
          if (place && !e.place) e.place = place;
          want.set(stno, e);
        } else {
          // student2.txt: تکمیلی — کلید stno در ستون ۰ (بیشتر سطرها خالی‌اند)
          const e = want.get(stno) || {};
          const m = normMob(cols[35]) || normMob(cols[16]) || normMob(cols[34]);
          if (m && !e.mobile) e.mobile = m;
          want.set(stno, e);
        }
        if (LIMIT && want.size >= LIMIT) break;
      }
    } catch (e) {
      console.log(`فایل ${f} خوانده نشد: ${e.message}`);
    }
  }
  // موبایل students1 از فایل تکمیلی جداست؛ ستون موبایل در students1 نیست — از HOMETELL صرف‌نظر می‌کنیم
  console.log(`نقشهٔ ترمیم: ${want.size} شماره دانشجویی`);

  const stats = { genderFix: 0, genderOk: 0, placeFix: 0, mobileFix: 0, noStudent: 0, checked: 0 };
  let shown = 0;
  for (const [stno, w] of want) {
    stats.checked++;
    const rows = await pool.query(
      `SELECT s.id, u.id AS "userId", u.gender, u."placeOfBirth", u."placeOfIssue", u.mobile
       FROM students s JOIN users u ON u.id = s."userId" WHERE s."studentCode" = $1 LIMIT 1`,
      [stno],
    );
    const r = rows.rows[0];
    if (!r) { stats.noStudent++; continue; }
    const sets = [];
    const vals = [];
    let vi = 1;
    if (w.gender && r.gender !== w.gender) {
      sets.push(`gender = $${vi++}`);
      vals.push(w.gender);
      stats.genderFix++;
      if (shown < 10) console.log(`  ${stno}: gender ${r.gender} → ${w.gender}`);
    } else if (w.gender) stats.genderOk++;
    if (w.place && (!r.placeOfBirth || r.placeOfBirth === '—')) {
      sets.push(`"placeOfBirth" = $${vi++}`);
      vals.push(w.place);
      stats.placeFix++;
    }
    if (w.place && (!r.placeOfIssue || r.placeOfIssue === '—')) {
      sets.push(`"placeOfIssue" = $${vi++}`);
      vals.push(w.place);
    }
    if (w.mobile && !r.mobile) {
      sets.push(`mobile = $${vi++}`);
      vals.push(w.mobile);
      stats.mobileFix++;
    }
    if (shown < 10 && sets.length) shown++;
    if (APPLY && sets.length) {
      vals.push(r.userId);
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vi}`, vals);
    }
    if (LIMIT && stats.checked >= LIMIT) break;
  }
  console.log(`\nخلاصه: بررسی=${stats.checked} | بدون دانشجو=${stats.noStudent} | جنسیت سالم=${stats.genderOk} | جنسیت نیازمند اصلاح=${stats.genderFix} | محل نیازمند پرشدن=${stats.placeFix} | موبایل نیازمند پرشدن=${stats.mobileFix}` + (APPLY ? ' | ✅ اعمال شد' : ' | (خشک — برای اجرا --apply بدهید)'));
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

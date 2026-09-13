#!/usr/bin/env node
/**
 * انتقال «پروندهٔ تکمیلی» دانشجو از سما به DB موجود (فقط فیلدهای خالی):
 *   خوابگاه/اتاق (SuiteName/RoomNumber)، ولی (ValiJobTitle/ValiTellNo/ValiAddress/ParentEmail)،
 *   دیپلم (FoghedipPlace/Year/Moadel + UPDiplomTypeCode خام)، پیش‌دانشگاهی (Pishd*)،
 *   کارت دانشجویی (StCardPrinted)، نظام وظیفه (NEZAM/MoafiatNumber/NezamNo)،
 *   پرونده/آرشیو (ParvandehNumber/ArchiveCode)، ایمیل/کدپستی/آدرس/گذرنامه/ملیت (users).
 *
 * استفاده در سرور:
 *   node scripts/fix-student-profile.mjs --dir "E:\git\information afagh"           # خشک
 *   node scripts/fix-student-profile.mjs --dir ... --apply                           # واقعی
 *   node scripts/fix-student-profile.mjs --dir ... --apply --limit 500
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
const yearOf = (s) => {
  const t = normTxt(s);
  const m = t.match(/^(1[34]\d{2})(\/|-)/);
  return m ? m[1] : (t && !t.includes('/') && /^1[34]\d{2}$/.test(t) ? t : null);
};
const boolVal = (s) => {
  const t = normTxt(s).toLowerCase();
  if (t === 'true' || t === '1' || t === 'y' || t === 'yes') return 1;
  if (t === 'false' || t === '0' || t === 'n' || t === 'no') return 0;
  return null;
};
const cardStatusFa = (s) => {
  const t = normTxt(s).toLowerCase();
  if (t === 'true' || t === '1') return 'صادر و تحویل شده';
  if (t === 'false' || t === '0') return 'چاپ نشده';
  return t || null;
};

try {
  const want = new Map(); // stno -> {fieldName: value}
  for (const f of ['students1.txt', 'student2.txt']) {
    try {
      for await (const { header, cols } of tsvRows(join(DIR, f))) {
        const stno = (cols[0] || '').trim();
        if (!/^\d{7,14}$/.test(stno)) continue;
        const e = want.get(stno) || {};
        if (f === 'students1.txt') {
          const nezam = normTxt(cols[33]);
          if (nezam) e.militaryStatus = nezam.slice(0, 50);
          if (!e.militaryExemptionNo && normTxt(cols[52])) e.militaryExemptionNo = normTxt(cols[52]).slice(0, 50);
          if (normTxt(cols[54]) && !e.diplomaPlace) e.diplomaPlace = normTxt(cols[54]).slice(0, 200); // MS گاهی محل اخذ دیپلم
          if (!e.insertDate && normTxt(cols[95])) e.insertDate = normTxt(cols[95]);
          if (!e.insertTime && normTxt(cols[96])) e.insertTime = normTxt(cols[96]);
          const nat = normTxt(cols[51]);
          if (!e.nationality) e.nationality = nat === '120001' || nat === '1' ? '120001' : (nat || null);
        } else {
          // student2.txt ← تکمیلی (کلید stno در ستون ۰ — برش می‌خورد)
          if (!e.email && normTxt(cols[13])) e.email = normTxt(cols[13]).slice(0, 150);
          if (!e.postalCode && normTxt(cols[11])) e.postalCode = normTxt(cols[11]).slice(0, 10);
          if (!e.address && normTxt(cols[8])) e.address = normTxt(cols[8]).slice(0, 300);
          if (!e.address && normTxt(cols[33])) e.address = normTxt(cols[33]).slice(0, 300);
          if (!e.passportNumber && normTxt(cols[20])) e.passportNumber = normTxt(cols[20]).slice(0, 20);
          if (normTxt(cols[6]) && !e.nationality) e.nationality = normTxt(cols[6]) === '1' ? '120001' : normTxt(cols[6]).slice(0, 10);
          if (!e.dormName && normTxt(cols[23])) e.dormName = normTxt(cols[23]).slice(0, 150);
          if (!e.dormRoom && normTxt(cols[22])) e.dormRoom = normTxt(cols[22]).slice(0, 50);
          if (e.hasDorm == null) e.hasDorm = boolVal(cols[26]);
          if (!e.guardianJobTitle && normTxt(cols[36])) e.guardianJobTitle = normTxt(cols[36]).slice(0, 100);
          if (!e.guardianPhone && normTxt(cols[37])) e.guardianPhone = normTxt(cols[37]).slice(0, 30);
          if (!e.guardianAddress && normTxt(cols[38])) e.guardianAddress = normTxt(cols[38]).slice(0, 300);
          if (!e.guardianEmail && normTxt(cols[70])) e.guardianEmail = normTxt(cols[70]).slice(0, 150);
          if (!e.diplomaType && normTxt(cols[62])) e.diplomaType = normTxt(cols[62]).slice(0, 50);
          if (!e.diplomaPlace && normTxt(cols[30])) e.diplomaPlace = normTxt(cols[30]).slice(0, 200);
          if (!e.diplomaYear) e.diplomaYear = yearOf(cols[31]);
          const dg = normTxt(cols[32]);
          if (!e.diplomaGrade && dg && dg !== '0') e.diplomaGrade = dg.slice(0, 20);
          if (!e.pishdPlace && normTxt(cols[29])) e.pishdPlace = normTxt(cols[29]).slice(0, 200);
          if (!e.pishdYear) e.pishdYear = yearOf(cols[27]);
          const pg2 = normTxt(cols[28]);
          if (!e.pishdGrade && pg2 && pg2 !== '0') e.pishdGrade = pg2.slice(0, 20);
          if (!e.studentCardStatus) e.studentCardStatus = cardStatusFa(cols[21]);
          if (!e.militaryExemptionNo && normTxt(cols[17])) e.militaryExemptionNo = normTxt(cols[17]).slice(0, 50);
          if (!e.militaryExemptionNo && normTxt(cols[74])) e.militaryExemptionNo = normTxt(cols[74]).slice(0, 50);
          if (normTxt(cols[74]) && !e.militaryStatus) e.militaryStatus = normTxt(cols[74]).slice(0, 50);
          if (!e.archiveNo && normTxt(cols[19])) e.archiveNo = normTxt(cols[19]).slice(0, 50);
          if (!e.parvandehNo && normTxt(cols[71])) e.parvandehNo = normTxt(cols[71]).slice(0, 100);
          if (!e.mobile) {
            const mob = normTxt(cols[35]) || normTxt(cols[16]) || normTxt(cols[34]);
            const d = String(mob || '').replace(/\D/g, '');
            const mobN = /^989\d{9}$/.test(d) ? '0' + d.slice(3) : (/^9\d{9}$/.test(d) ? '0' + d : (d || null));
            if (mobN && /^\d{11}$/.test(mobN)) e.mobile = mobN;
          }
        }
        want.set(stno, e);
        if (LIMIT && want.size >= LIMIT) break;
      }
    } catch (e) {
      console.log(`فایل ${f} خوانده نشد: ${e.message}`);
    }
  }
  console.log(`نقشهٔ ترمیم پرونده: ${want.size} شماره دانشجویی`);

  const stats = { checked: 0, noStudent: 0, filled: 0, changedUsers: 0, filledUsers: 0 };
  let shown = 0;
  for (const [stno, w] of want) {
    stats.checked++;
    const rows = await pool.query(
      `SELECT s.id, u.id AS "userId",
              u.email, u."postalCode", u.address, u."passportNumber", u.nationality, u.mobile,
              s."advisorCode", s."documentStatus", s."scholarshipType", s."militaryStatus",
              s."militaryExemptionNo", s."studentCardStatus", s."archiveNo", s."parvandehNo",
              s."dormName", s."dormRoom", s."hasDorm", s."guardianJobTitle", s."guardianPhone",
              s."guardianAddress", s."guardianEmail", s."diplomaType", s."diplomaPlace",
              s."diplomaYear", s."diplomaGrade", s."pishdPlace", s."pishdYear", s."pishdGrade"
       FROM students s JOIN users u ON u.id = s."userId" WHERE s."studentCode" = $1 LIMIT 1`,
      [stno],
    );
    const r = rows.rows[0];
    if (!r) { stats.noStudent++; continue; }
    const uSets = []; const uVals = []; let ui = 1;
    const uMap = [
      ['email', 'email'], ['postalCode', 'postalCode'], ['address', 'address'],
      ['passportNumber', 'passportNumber'], ['nationality', 'nationality'], ['mobile', 'mobile'],
    ];
    for (const [k, col] of uMap) {
      if (w[k] && !r[col]) { uSets.push(`"${col}" = $${ui++}`); uVals.push(w[k]); stats.filledUsers++; }
    }
    const sSets = []; const sVals = []; let si = 1;
    const sMap = [
      'advisorCode', 'documentStatus', 'scholarshipType', 'militaryStatus', 'militaryExemptionNo',
      'studentCardStatus', 'archiveNo', 'parvandehNo', 'dormName', 'dormRoom', 'guardianJobTitle',
      'guardianPhone', 'guardianAddress', 'guardianEmail', 'diplomaType', 'diplomaPlace',
      'diplomaYear', 'diplomaGrade', 'pishdPlace', 'pishdYear', 'pishdGrade',
    ];
    for (const k of sMap) {
      if (w[k] != null && !r[k]) { sSets.push(`"${k}" = $${si++}`); sVals.push(w[k]); stats.filled++; }
    }
    if (w.hasDorm != null && r.hasDorm == null) { sSets.push(`"hasDorm" = $${si++}`); sVals.push(w.hasDorm); }

    if (shown < 8 && (uSets.length || sSets.length)) {
      console.log(`  ${stno}: ${sSets.map(s => s.split('=')[0].trim()).join(', ') || uSets.map(s => s.split('=')[0].trim()).join(', ')}`);
      shown++;
    }
    if (APPLY) {
      if (uSets.length) { uVals.push(r.userId); await pool.query(`UPDATE users SET ${uSets.join(', ')} WHERE id = $${ui}`, uVals); stats.changedUsers++; }
      if (sSets.length) { sVals.push(r.id); await pool.query(`UPDATE students SET ${sSets.join(', ')} WHERE id = $${si}`, sVals); }
    }
    if (LIMIT && stats.checked >= LIMIT) break;
  }
  console.log(`\nخلاصه: بررسی=${stats.checked} | بدون دانشجو=${stats.noStudent} | فیلد تکمیلی دانشجو پر=${stats.filled} | فیلد هویت(users) پر=${stats.filledUsers}` + (APPLY ? ` | ✅ اعمال شد (${stats.changedUsers} کاربر)` : ' | (خشک — برای اجرا --apply بدهید)'));
} catch (err) {
  console.error('❌ خطا:', err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
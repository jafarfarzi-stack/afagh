#!/usr/bin/env node
// Fix student nationalCode (uni1/AFAGH): synthetic SA.../placeholder -> real value from
// students1.txt col12 -> studentraw data.txt col12 -> student2.txt col7.
// Unresolvable synthetics are NULLed (NOT NULL already dropped). Clash-safe vs unique index.
// Valid DB codes are NEVER overwritten (mismatches only reported).
// Usage: tsx scripts/fix-student-nc.mjs --dir /data --uni 1 [--apply]
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const raw = process.argv.slice(2);
const args = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const key = raw[i].slice(2);
    args[key] = (raw[i + 1] && !raw[i + 1].startsWith('--')) ? raw[++i] : 'true';
  }
}
const DIR = args.dir || '.';
const UNI = args.uni ? Number(args.uni) : 1;
const APPLY = args.apply === 'true';
const { Pool } = pg;

const dec1256 = new TextDecoder('windows-1256');
async function loadCol(file, keyIdx, valIdx) {
  const m = new Map();
  const stream = createReadStream(join(DIR, file), { highWaterMark: 8 * 1024 * 1024 });
  let carry = Buffer.alloc(0), header = false, n = 0;
  for await (const chunk of stream) {
    const buf = Buffer.concat([carry, chunk]);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) {
        const line = dec1256.decode(buf.subarray(start, i)).replace(/\r/g, '');
        start = i + 1;
        if (!line.trim()) continue;
        if (!header) { header = true; continue; } // سطر اول: هدرِ خالی
        const c = line.split('\t');
        const k = (c[keyIdx] || '').trim();
        if (!k || m.has(k)) continue;
        const v = (c[valIdx] || '').trim();
        if (v) { m.set(k, v); n++; }
      }
    }
    carry = buf.subarray(start);
  }
  return { map: m, n };
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
function isNC(s) {
  const t = norm(s);
  if (!/^\d{10}$/.test(t)) return false;
  if (/^(\d)\1{9}$/.test(t)) return false; // 1111111111 و امثال آن
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += +t[i] * (10 - i);
  const r = sum % 11;
  return (r < 2 && +t[9] === r) || (r >= 2 && +t[9] === 11 - r);
}
const isSynthetic = (nc) => !nc || /^S/i.test(nc) || !isNC(nc);

const A = await loadCol('students1.txt', 0, 12);
const B = await loadCol('studentraw data.txt', 0, 12);
const C = await loadCol('student2.txt', 0, 7);
console.log(`نقشهٔ کد ملی: students1=${A.n} studentraw=${B.n} student2=${C.n}`);
const fileNC = (stno) => {
  for (const { map } of [A, B, C]) { const v = map.get(stno); if (v && isNC(v)) return v; }
  return null;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const stats = { ok: 0, setReal: 0, nulled: 0, clash: 0, diffReal: 0, noFileValid: 0 };
const show = [];
const clashCodes = [];
const diffCodes = [];

const owners = new Map();
{
  const r = await pool.query(`SELECT id, "nationalCode" FROM users WHERE "nationalCode" IS NOT NULL`);
  for (const row of r.rows) owners.set(row.nationalCode, row.id);
}

const sts = await pool.query(
  `SELECT s."studentCode", s."userId", u."nationalCode"
   FROM students s JOIN users u ON u.id = s."userId" WHERE s."universityId" = $1`,
  [UNI],
);
for (const st of sts.rows) {
  const code = st.studentCode, dbNC = st.nationalCode, uid = st.userId;
  const f = fileNC(code);
  if (isSynthetic(dbNC)) {
    if (f) {
      const owner = owners.get(f);
      if (owner && owner !== uid) {
        stats.clash++; stats.nulled++; clashCodes.push(code);
        if (show.length < 15) show.push(`${code}: فایل=${f} ← متعلق به دیگری؛ synthetic پاک شد`);
        if (APPLY) await pool.query(`UPDATE users SET "nationalCode"=NULL WHERE id=$1`, [uid]);
      } else {
        stats.setReal++;
        if (show.length < 15) show.push(`${code}: ${dbNC || '—'} → ${f}`);
        if (APPLY) { await pool.query(`UPDATE users SET "nationalCode"=$1 WHERE id=$2`, [f, uid]); owners.set(f, uid); }
      }
    } else {
      stats.nulled++;
      if (show.length < 15) show.push(`${code}: ${dbNC} ← بدون مقدار واقعی در فایل؛ پاک شد`);
      if (APPLY) await pool.query(`UPDATE users SET "nationalCode"=NULL WHERE id=$1`, [uid]);
    }
  } else if (f && f !== dbNC) {
    stats.diffReal++; diffCodes.push(code);
    if (show.length < 15) show.push(`${code}: DB واقعی=${dbNC} ≠ فایل=${f} ← DB حفظ شد (فقط گزارش)`);
  } else if (!f) {
    stats.noFileValid++; stats.ok++;
  } else stats.ok++;
}
for (const s of show) console.log('  ' + s);
console.log(`\nخلاصه (uni ${UNI}): دانشجو=${sts.rows.length} | سالم=${stats.ok} | واقعی‌نوشته=${stats.setReal} | مغایرت‌واقعی(حفظ‌شده)=${stats.diffReal} | syntheticپاک‌شده=${stats.nulled} | تداخل=${stats.clash} | معتبرِبی‌فایل=${stats.noFileValid}` + (APPLY ? ' | ✅ اعمال شد' : ' | (خشک)'));
if (clashCodes.length) console.log(`تداخل (${clashCodes.length}): ${clashCodes.slice(0, 25).join(', ')}`);
if (diffCodes.length) console.log(`مغایرت واقعی (${diffCodes.length}): ${diffCodes.slice(0, 25).join(', ')}`);
await pool.end();

#!/usr/bin/env node
/**
 * پرکردن کد ملیِ خالیِ اساتید از فایل مبدأ (بدون دست‌زدن به بقیهٔ ستون‌ها)
 *
 * وقتی کد استاد در فایل کدملی دارد و آن کدملی آزاد است (مالکِ کاربر دیگری نیست)
 * و کاربر هنوز nationalCode خالی دارد → کدملی را می‌نویسیم.
 * اگر هش رمز هم خراب باشد (MIGRATED:…) رمز = کدملی و تغییر اجباری فعال می‌شود.
 *
 *   node scripts/fill-professor-nc.mjs              # dry-run
 *   node scripts/fill-professor-nc.mjs --apply
 */
import { createReadStream } from 'node:fs';
import { randomBytes, scrypt } from 'node:crypto';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DBURL = process.env.DATABASE_URL || process.env.DBURL;
if (!DBURL) {
  console.error('DATABASE_URL/DBURL تنظیم نشده');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DBURL, max: 4 });
const q = async (t, p) => (await pool.query(t, p)).rows;

const FILES = [
  { path: '/root/information-afagh/ostadan.txt', ncIdx: [31, 32], nameCol: 1 },
  { path: '/root/information-afagh/اساتید2.txt', ncIdx: [26, 27], nameCol: 0 },
];
const UNIVERSITY_ID = Number(process.argv.find(a => a.startsWith('--university='))?.split('=')[1] || 1);
const dec = new TextDecoder('windows-1256');
async function* fileRows(path) {
  const st = createReadStream(path, { highWaterMark: 8 * 1024 * 1024 });
  let carry = Buffer.alloc(0);
  let header = 0;
  for await (const chunk of st) {
    const buf = Buffer.concat([carry, chunk]);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 10) continue;
      const line = dec.decode(buf.subarray(start, i)).replace(/\r/g, '');
      start = i + 1;
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (!header) {
        header = 1;
        continue;
      }
      yield cols;
    }
    carry = buf.subarray(start);
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await new Promise((res, rej) =>
    scrypt(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (e, b) =>
      e ? rej(e) : res(b),
    ),
  );
  return `${salt}:${buf.toString('hex')}`;
}

async function main() {
  console.log(`\n=== پرکردن کد ملی اساتید — ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`);
  const ncByCode = new Map();
  const nameByCode = new Map();
  for (const f of FILES) {
    for await (const cols of fileRows(f.path)) {
      const code = String(cols[0] ?? '').trim();
      if (!/^\d+$/.test(code) || code === '0') continue;
      for (const i of f.ncIdx) {
        const v = String(cols[i] ?? '').trim();
        if (v !== code && isPlausibleNC(v)) {
          if (!ncByCode.has(code)) ncByCode.set(code, v);
          break;
        }
      }
      const nm = String(cols[f.nameCol] ?? '').trim();
      if (nm && !nameByCode.has(code)) nameByCode.set(code, nm);
    }
  }
  console.log(`کدملیِ خوانده‌شده از فایل: ${ncByCode.size}`);

  const nullNc = await q(`
    SELECT s."staffCode" code, s.id sid, s."universityId" uni, u.id uid, u."firstName"||' '||u."lastName" nm,
           u."passwordHash" hash, u."isActive" active
    FROM staff s JOIN users u ON u.id = s."userId"
    WHERE u."nationalCode" IS NULL AND s."universityId" = $1
    ORDER BY s."staffCode"`, [UNIVERSITY_ID]);
  const owned = new Set(
    (await q(`SELECT "nationalCode" nc, "universityId" uni FROM users WHERE "nationalCode" IS NOT NULL AND "universityId" = $1`, [UNIVERSITY_ID])).map((r) => r.nc + '|' + r.uni),
  );

  const plan = [];
  const skipNoFile = [];
  const skipClash = [];
  for (const r of nullNc) {
    const code = String(r.code ?? '').trim();
    const nc = ncByCode.get(code);
    if (!nc) {
      skipNoFile.push(r);
      continue;
    }
    if (owned.has(nc + '|' + r.uni)) {
      skipClash.push({ ...r, nc });
      continue;
    }
    plan.push({ ...r, nc, needPwd: !hashOk(r.hash) });
  }

  const cur = `(SELECT id FROM academic_terms WHERE "isCurrent" = 1 AND "universityId" = ${UNIVERSITY_ID} ORDER BY id LIMIT 1)`;
  const teaching = new Set(
    (await q(`SELECT DISTINCT "professorId" sid FROM course_offerings WHERE "termId" = ${cur}`)).map(
      (r) => r.sid,
    ),
  );
  const t = (sid) => (teaching.has(sid) ? ' ★ترم_جاری' : '');

  console.log(`\nکاربران staff-دار بدون کدملی: ${nullNc.length}`);
  console.log(`  ✔ قابل پرکردن: ${plan.length}`);
  console.log(`  ✖ کدملیِ فایل متعلق به کاربر دیگر: ${skipClash.length}`);
  console.log(`  – کدملی در فایل نیست: ${skipNoFile.length}`);
  console.log('\n— قابل پرکردن —');
  for (const p of plan)
    console.log(
      `  ${p.code} ${p.nm} → ${p.nc}${p.needPwd ? ' (رمز=کدملی)' : ''}${t(p.sid)}`,
    );
  if (skipClash.length) {
    console.log('\n— تداخل —');
    for (const c of skipClash) console.log(`  ${c.code} ${c.nm} → ${c.nc}${t(c.sid)}`);
  }
  const teachingNoFile = skipNoFile.filter((s) => teaching.has(s.sid));
  console.log(`\nبدون کدملی در فایل: ${skipNoFile.length} (ترم جاری: ${teachingNoFile.length})`);
  for (const s of teachingNoFile) console.log(`  ★ ${s.code} ${s.nm}`);

  if (!APPLY) {
    console.log('\n(DRY-RUN — چیزی نوشته نشد. برای اجرا: --apply)');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let ncSet = 0;
    let pwdSet = 0;
    for (const p of plan) {
      const h = p.needPwd ? await hashPassword(p.nc) : null;
      const r = await client.query(
        `UPDATE users SET "nationalCode" = $2,
                "passwordHash" = COALESCE($3, "passwordHash"),
                "mustChangePassword" = CASE WHEN $4::boolean THEN 1 ELSE "mustChangePassword" END
         WHERE id = $1 AND "nationalCode" IS NULL`,
        [p.uid, p.nc, h, p.needPwd],
      );
      if (r.rowCount) {
        ncSet++;
        if (p.needPwd) pwdSet++;
      }
    }
    await client.query('COMMIT');
    console.log(`\n✅ کدملی ثبت شد: ${ncSet} | رمز بازنشانی شد: ${pwdSet}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nROLLBACK — هیچ تغییری اعمال نشد:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

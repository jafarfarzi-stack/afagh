#!/usr/bin/env node
/**
 * بازنشانی رمز حساب‌های staff-دارِ بدون کدملی که هش خراب دارند (MIGRATED:…)
 * رمز = کد پرسنلی (staffCode) + تغییر اجباری در اولین ورود.
 * این حساب‌ها با هش خراب هیچ‌وقت نمی‌توانستند وارد شوند؛ حالا با «کد پرسنلی»
 * به‌عنوان نام‌کاربری وارد می‌شوند.
 *
 *   node scripts/reset-orphan-staff-passwords.mjs           # dry-run
 *   node scripts/reset-orphan-staff-passwords.mjs --apply
 */
import pg from 'pg';
import { randomBytes, scrypt } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const DBURL = process.env.DATABASE_URL || process.env.DBURL;
if (!DBURL) {
  console.error('DATABASE_URL/DBURL تنظیم نشده');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DBURL, max: 4 });
const q = async (t, p) => (await pool.query(t, p)).rows;
const hashOk = (h) => /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(String(h || ''));

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
  console.log(`\n=== بازنشانی رمز حساب‌های بدون‌کدملی — ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`);
  const rows = await q(`
    SELECT s."staffCode" code, u.id uid, u."firstName"||' '||u."lastName" nm,
           u."passwordHash" h, u."isActive" active
    FROM staff s JOIN users u ON u.id = s."userId"
    WHERE u."nationalCode" IS NULL
    ORDER BY s."staffCode"`);
  const targets = rows.filter((r) => !hashOk(r.h));
  console.log(`staff-دار بدون کدملی: ${rows.length} | هش خراب: ${targets.length} (فعال: ${targets.filter((t) => t.active === 1).length})`);
  for (const t of targets.slice(0, 15)) console.log(`  ${t.code} ${t.nm} (فعال:${t.active})`);
  if (targets.length > 15) console.log(`  ... و ${targets.length - 15} مورد دیگر`);

  if (!APPLY) {
    console.log('\n(DRY-RUN — چیزی نوشته نشد. برای اجرا: --apply)');
    await pool.end();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const t of targets) {
      const h = await hashPassword(String(t.code).trim());
      const r = await client.query(
        `UPDATE users SET "passwordHash"=$2, "mustChangePassword"=1 WHERE id=$1`,
        [t.uid, h],
      );
      if (r.rowCount) n++;
    }
    await client.query('COMMIT');
    console.log(`\n✅ رمز ${n} حساب به کد پرسنلی بازنشانی شد (تغییر اجباری در اولین ورود).`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nROLLBACK:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

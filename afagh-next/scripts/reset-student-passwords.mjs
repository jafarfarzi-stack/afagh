#!/usr/bin/env node
/**
 * بازنشانی رمز حساب‌هایی که هش غیرقابل‌استفاده دارند (MIGRATED:… و امثال آن).
 * این حساب‌ها امروز اصلاً نمی‌توانند وارد شوند.
 * قانون رمز: staff‌دار → کد پرسنلی؛ وگرنه کدملیِ معتبر؛ وگرنه کوچک‌ترین شماره دانشجویی.
 * همه mustChangePassword=1 (تغییر اجباری در اولین ورود).
 * کاربرانِ بدون هیچ ردیف staff/student دست نمی‌خورند (گزارش می‌شوند).
 *
 *   node scripts/reset-student-passwords.mjs           # dry-run
 *   node scripts/reset-student-passwords.mjs --apply
 */
import pg from 'pg';
import { randomBytes, scrypt } from 'node:crypto';
import { execSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const CONC = Number(process.env.CONC || 32);
const DBURL = process.env.DATABASE_URL || process.env.DBURL;
if (!DBURL) {
  console.error('DATABASE_URL/DBURL تنظیم نشده');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DBURL, max: 8 });
const ncOk = (v) =>
  /^[0-9]{10}$/.test(v || '') && !/^(\d)\1{9}$/.test(v) && !['1234567890', '9876543210', '0123456789'].includes(v);

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
  console.log(`\n=== بازنشانی رمز هش‌های خراب — ${APPLY ? 'APPLY' : 'DRY-RUN'} (conc=${CONC}) ===\n`);
  const rows = (
    await pool.query(`
    SELECT u.id uid, u."nationalCode" nc, u."isActive" active,
           max(s."staffCode") AS sc,
           min(st."studentCode") AS stc
    FROM users u
    LEFT JOIN staff s ON s."userId" = u.id
    LEFT JOIN students st ON st."userId" = u.id
    WHERE u."passwordHash" NOT SIMILAR TO '[0-9a-f]{32}:[0-9a-f]{64}'
    GROUP BY u.id, u."nationalCode", u."isActive"`)
  ).rows;

  const plan = [];
  const skip = [];
  for (const r of rows) {
    let pw = null;
    let via = '';
    if (r.sc) {
      pw = String(r.sc).trim();
      via = 'staffCode';
    } else if (ncOk(r.nc)) {
      pw = r.nc;
      via = 'NC';
    } else if (r.stc) {
      pw = String(r.stc).trim();
      via = 'studentCode';
    } else {
      skip.push(r);
      continue;
    }
    plan.push({ ...r, pw, via });
  }
  const byVia = {};
  for (const p of plan) byVia[p.via] = (byVia[p.via] || 0) + 1;
  console.log(`هش خراب: ${rows.length} | قابل بازنشانی: ${plan.length} ${JSON.stringify(byVia)} | ردشده (بدون ردیف): ${skip.length}`);
  for (const s of skip.slice(0, 10))
    console.log(`  رد: id=${s.uid} nc=${s.nc} active=${s.active}`);
  console.log(`نمونه: ${plan.slice(0, 3).map((p) => `${p.via}=${p.pw}`).join('، ')}`);

  if (!APPLY) {
    console.log('\n(DRY-RUN — چیزی نوشته نشد. برای اجرا: --apply)');
    await pool.end();
    return;
  }

  // بکاپ برگشت‌پذیر هش‌ها
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const bakFile = `/root/afagh/backups/pw-badhash-${ts}.csv`;
  execSync(
    `docker exec afagh_pg psql -U afagh -d afagh_db -c "COPY (SELECT id, \\"passwordHash\\", \\"mustChangePassword\\" FROM users WHERE \\"passwordHash\\" NOT SIMILAR TO '[0-9a-f]{32}:[0-9a-f]{64}') TO STDOUT CSV" > ${bakFile}`,
  );
  console.log(`بکاپ هش‌ها: ${bakFile}`);

  let done = 0;
  const client = await pool.connect();
  // قفل نوشتن: فقط یک کارگر هم‌زمان با همین کانکشن تراکنش می‌زند
  let writeLock = Promise.resolve();
  const withWriteLock = (fn) => {
    const run = writeLock.then(fn, fn);
    writeLock = run.catch(() => {});
    return run;
  };
  try {
    const queue = [...plan];
    let lastReport = 0;
    const workers = Array.from({ length: CONC }, async () => {
      const local = [];
      while (queue.length) {
        const p = queue.pop();
        if (!p) break;
        p.hash = await hashPassword(p.pw);
        local.push(p);
        if (local.length >= 250) {
          const chunk = local.splice(0, local.length);
          await withWriteLock(async () => {
            await client.query('BEGIN');
            for (const c of chunk) {
              await client.query(`UPDATE users SET "passwordHash"=$2, "mustChangePassword"=1 WHERE id=$1`, [c.uid, c.hash]);
            }
            await client.query('COMMIT');
            done += chunk.length;
            if (done - lastReport >= 2000 || done === plan.length) {
              lastReport = done;
              console.log(`  … ${done}/${plan.length}`);
            }
          });
        }
      }
      if (local.length) {
        const chunk = local.splice(0, local.length);
        await withWriteLock(async () => {
          await client.query('BEGIN');
          for (const c of chunk) {
            await client.query(`UPDATE users SET "passwordHash"=$2, "mustChangePassword"=1 WHERE id=$1`, [c.uid, c.hash]);
          }
          await client.query('COMMIT');
          done += chunk.length;
          console.log(`  … ${done}/${plan.length}`);
        });
      }
    });
    await Promise.all(workers);
    console.log(`\n✅ رمز ${done} حساب بازنشانی شد (تغییر اجباری در اولین ورود).`);
  } catch (e) {
    console.error('\nخطا (بچِ جاری ممکن است ناقص باشد — بکاپ موجود است):', e.message);
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

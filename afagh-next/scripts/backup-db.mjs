#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  پشتیبان‌گیری پیش از استقرار (Pre-Deployment Backup — بازبینی مهندسی)
 *
 *  سناریوی پوشش: اگر drizzle-kit push یا پچ‌ها وسط استقرار شکست بخورند،
 *  نسخهٔ قبلی دیتابیس باید قابل بازگشت باشد. این اسکریپت در ابتدای migrator
 *  اجرا می‌شود (به‌قبل از هر تغییر اسکیما) و یک Dump فشردهٔ PostgreSQL
 *  (فرمت custom) در /backups می‌سازد.
 *
 *  بازیابی:
 *    pg_restore -d "$DATABASE_URL" /backups/afagh-<timestamp>.dump -c --if-exists
 *    (در کانتینر migrator: docker compose run --rm --entrypoint sh migrator)
 *
 *  اگر pg_dump روی سیستم نباشد (توسعه) → هشدار و ادامه (بدون توقف نصب).
 * ════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PG_URL = process.env.DATABASE_URL;
const OUT_DIR = process.env.AFAGH_BACKUP_DIR || '/backups';

function pgDumpMajor() {
  try {
    // خروجی: «pg_dump (PostgreSQL) 16.4 (Debian ...)»
    const out = execFileSync('pg_dump', ['--version'], { encoding: 'utf8' });
    const m = out.match(/(\d+)\.\d+/) || out.match(/\)\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** نسخهٔ اصلی سرور — بدون وابستگی به pg_dump */
async function serverMajor() {
  try {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: PG_URL });
    await c.connect();
    const r = await c.query('SHOW server_version');
    await c.end();
    const v = String(r.rows[0].server_version);
    return Number(v.split('.')[0]);
  } catch {
    return null;
  }
}

if (!PG_URL) {
  console.error('❌ DATABASE_URL لازم است.');
  process.exit(1);
}

// راه گریز آگاهانه — فقط وقتی خودتان تازه پشتیبان گرفته‌اید:
//     AFAGH_SKIP_BACKUP=1 docker compose up -d
if (process.env.AFAGH_SKIP_BACKUP === '1') {
  console.warn('⚠ AFAGH_SKIP_BACKUP=1 — پشتیبان‌گیری عمداً رد شد. مسئولیت با شماست.');
  process.exit(0);
}

const dumpV = pgDumpMajor();
if (dumpV === null) {
  console.warn('⚠ pg_dump یافت نشد — پشتیبان‌گیری رد شد (در ایمیج migrator موجود است؛ فقط توسعه).');
  process.exit(0);
}

// ⚠️ pg_dump قدیمی‌تر از سرور، حاضر به کار نیست («server version mismatch»).
//    این یک نقص ابزار است نه خطر داده؛ ولی چون پشتیبان‌گیری نخستین گام
//    migrator است، بی‌آنکه معلوم شود کل استقرار را متوقف می‌کرد. حالا پیام
//    دقیق می‌دهیم تا کاربر بداند چه چیزی را باید درست کند.
const srvV = await serverMajor();
if (srvV !== null && dumpV < srvV) {
  console.error(
    `❌ ناسازگاری نسخه: pg_dump نسخهٔ ${dumpV} است ولی سرور PostgreSQL نسخهٔ ${srvV}.\n` +
    `   pg_dump قدیمی‌تر از سرور کار نمی‌کند.\n` +
    `   راه‌حل: ایمیج migrator را دوباره بسازید تا postgresql-client-${srvV} نصب شود:\n` +
    `       docker compose build --no-cache migrator && docker compose up -d\n` +
    `   اگر سرورتان به apt.postgresql.org دسترسی ندارد و پشتیبان دستی گرفته‌اید:\n` +
    `       AFAGH_SKIP_BACKUP=1 docker compose up -d`);
  process.exit(1);
}

try {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(OUT_DIR, `afagh-${stamp}.dump`);
  execFileSync('pg_dump', [PG_URL, '-Fc', '-f', file], { stdio: 'inherit' });
  console.log(`✅ پشتیبان پیش از استقرار: ${file}`);
} catch (err) {
  console.error('❌ پشتیبان‌گیری ناموفق — استقرار متوقف شد (حفظ داده مقدم بر تغییر است):', err.message);
  process.exit(1);
}

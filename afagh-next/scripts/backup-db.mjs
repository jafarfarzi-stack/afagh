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

function hasPgDump() {
  try {
    execFileSync('pg_dump', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!PG_URL) {
  console.error('❌ DATABASE_URL لازم است.');
  process.exit(1);
}

if (!hasPgDump()) {
  console.warn('⚠ pg_dump یافت نشد — پشتیبان‌گیری رد شد (در ایمیج migrator موجود است؛ فقط توسعه).');
  process.exit(0);
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

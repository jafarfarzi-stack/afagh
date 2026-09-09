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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const PG_URL = process.env.DATABASE_URL;
/**
 * P0-2: مقصد پشتیبان باید *ماندگار* باشد.
 *   • در ایمیج migrator، /backups یک volume مشترک است (afagh_backups) —
 *     پیش از این همان‌جا نوشته می‌شد و با `docker compose down` می‌رفت.
 *   • اگر /backups قابل‌ساخت/نوشتنی نبود (توسعهٔ محلی) → ./backups کنار مخزن.
 *   • AFAGH_BACKUP_DIR برای هدایت به مسیر میزبان/NAS.
 */
const OUT_CANDIDATES = [process.env.AFAGH_BACKUP_DIR, '/backups', path.join(process.cwd(), 'backups')].filter(Boolean);
function pickOutDir() {
  for (const dir of OUT_CANDIDATES) {
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.afagh-write-probe');
      writeFileSync(probe, 'x');
      rmSync(probe, { force: true });
      return dir;
    } catch { /* بعدی را امتحان کن */ }
  }
  return null;
}

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

const OUT_DIR = pickOutDir();
if (!OUT_DIR) {
  console.error('❌ هیچ پوشهٔ نوشتنی برای پشتیبان پیدا نشد (AFAGH_BACKUP_DIR / /backups / ./backups).');
  console.error('   در compose این پوشه volume است:  afagh_backups:/backups — اگر ایمیج قدیمی است، دوباره بسازید.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = path.join(OUT_DIR, `afagh-${stamp}.dump`);
try {
  execFileSync('pg_dump', [PG_URL, '-Fc', '-f', file], { stdio: 'inherit' });
} catch (err) {
  console.error('❌ پشتیبان‌گیری ناموفق — استقرار متوقف شد (حفظ داده مقدم بر تغییر است):', err.message);
  process.exit(1);
}

// ── P0-2: یک Dump که خوانده نشود، پشتیبان نیست ──
// ۱) فهرست‌پذیری با pg_restore (ساختار واقعاً قابل بازگردانی است؟)
// ۲) حداقل اندازه (dump خالی ≈ چند بایت؛ دیتابیس این پروژه صدها کیلوبایت+)
// ۳) فایل کنارآمد sha256 تا «verify-backup» و بازبینی دیسک/NAS ممکن باشد
try {
  const listing = execFileSync('pg_restore', ['--list', file], { encoding: 'buffer', maxBuffer: 64 << 20 });
  const bytes = statSync(file).size;
  if (bytes < 4096) throw new Error(`حجم غیرمنتظرهٔ کم: ${bytes} بایت`);
  if (listing.length < 64) throw new Error('pg_restore --list خروجی ندارد (آرشیو خراب است)');
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  writeFileSync(file + '.sha256', `${sha}  ${path.basename(file)}\n`, { mode: 0o600 });
  writeFileSync(path.join(OUT_DIR, 'LATEST'), path.basename(file) + '\n');
  console.log(`✅ پشتیبان پیش از استقرار: ${file} (${(bytes / 1048576).toFixed(2)}MB، sha256 ${sha.slice(0, 12)}…)`);
} catch (err) {
  console.error('❌ پشتیبان ساخته شد ولی راستی‌آزمایی نشد — همان بی‌اتکا بودن است؛ استقرار متوقف شد:', err.message);
  try { rmSync(file, { force: true }); } catch {}
  process.exit(1);
}

// ── retention: فقط AFAGH_BACKUP_KEEP نسخهٔ آخر می‌ماند (پیش‌فرض ۱۴) تا دیسک پر نشود ──
const keep = Number(process.env.AFAGH_BACKUP_KEEP ?? 14);
if (Number.isFinite(keep) && keep > 0) {
  const dumps = readdirSync(OUT_DIR).filter((f) => /^afagh-.*\.dump$/.test(f)).sort().reverse();
  for (const old of dumps.slice(keep)) {
    try { rmSync(path.join(OUT_DIR, old), { force: true }); rmSync(path.join(OUT_DIR, old + '.sha256'), { force: true }); } catch {}
  }
  if (dumps.length > keep) console.log(`   (retention) ${dumps.length - keep} پشتیبان کهنه حذف شد — ${keep} آخر نگه داشته شد`);
}

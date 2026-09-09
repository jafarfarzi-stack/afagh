#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  ساخت حساب مدیر اولیه (P0-4 — «رمز ثابت در خروجی نصب» حذف شود)
 *
 *  پیش از این، خلاصهٔ نصب یک رمز ثابت (123456) و کدهای ملیِ دموی شناخته‌شده را
 *  چاپ می‌کرد. آن حساب‌ها فقط با «حالت دمو» ساخته می‌شوند و در ایمیج تولید قفل
 *  است — یعنی نصب پروداکشن عملاً *هیچ* ورودی نداشت و اگر دمو باز بود، ورودی با
 *  رمز حدس‌زدنی داشت. هر دو بد است.
 *
 *  این اسکریپت راه درست را می‌دهد:
 *    • رمز تصادفی قوی (پیش‌فرض ۲۰ کاراکتر از آلفابت بدون کاراکرتبهم)
 *    • mustChangePassword = 1 → اولین ورود، تغییر رمز اجباری است
 *    • رمز در **استاندارد خروجی چاپ نمی‌شود**؛ فقط در فایل کنارآمد (۰۶۰۰)
 *      و با --show یک‌بار نمایش داده می‌شود
 *    • اجرا در ایمیج migrator (اتصال مالک) یا روی هاست
 *
 *  استفاده:
 *    node scripts/create-admin.mjs                       ← مدیر تازه + رمز تصادفی
 *    node scripts/create-admin.mjs --show                 ← چاپ رمز برای اپراتور (یک‌بار)
 *    node scripts/create-admin.mjs --national-code 0000000001 --name "مدیر سامانه"
 *    node scripts/create-admin.mjs --reset                ← رمز حساب موجود را می‌چرخاند
 *    node scripts/create-admin.mjs --password "$(…) --no-force-change   ← خودکارسازی
 *
 *  در داکر:   docker compose run --rm --no-deps migrator node scripts/create-admin.mjs --show
 *  یا میان‌بُر:  make admin
 * ════════════════════════════════════════════════════════════════════════
 */
import { randomBytes, scrypt as _scrypt } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { POLICY } from './lib/secret-policy.mjs';

const scrypt = promisify(_scrypt);
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const URL = process.env.DATABASE_URL;
if (!URL) { console.error('❌ DATABASE_URL لازم است (اتصال مالک — همان چیزی که migrator دارد).'); process.exit(2); }

const nationalCode = opt('--national-code', '1000000001');
const fullName = opt('--name', 'مدیر سامانه');
const role = opt('--role', 'ADMIN');
const credFile = opt('--credential-file', process.env.AFAGH_CREDENTIAL_FILE || path.join(process.cwd(), '.afagh-admin-credential'));
const forceChange = !flag('--no-force-change');

/** همان الگوی هش src/lib/auth.ts: salt:scrypt(password) — مهاجرت‌پذیر */
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, 32, {
    N: Number(process.env.AFAGH_SCRYPT_N || 16384), r: 8, p: 1, maxmem: 256 * 1024 * 1024,
  });
  return `${salt}:${buf.toString('hex')}`;
}

function randomPassword(len = 24) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const b = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[b[i] % alphabet.length];
  return out;
}

const password = opt('--password') || randomPassword(24);
if (password.length < 12 && !flag('--allow-weak')) {
  console.error('❌ رمز داده‌شده کوتاه است (حداقل ۱۲). برای تست از --allow-weak استفاده کنید.');
  process.exit(2);
}

const c = new pg.Client({ connectionString: URL });
await c.connect();
try {
  const roleRow = await c.query('select id, code from roles where code=$1', [role]);
  if (!roleRow.rows.length) {
    console.error(`❌ نقش «${role}» در جدول roles نیست — اول: node scripts/seed-base.mjs (نقش‌ها را می‌سازد)`);
    process.exit(3);
  }
  const [firstName, ...rest] = String(fullName).trim().split(/\s+/);
  const lastName = rest.join(' ') || '—';

  const existing = await c.query('select id from users where "nationalCode"=$1', [nationalCode]);
  let userId;
  if (existing.rows.length) {
    if (!flag('--reset')) {
      console.error(`❌ کاربری با کد ملی ${nationalCode} از قبل هست. برای چرخش رمز: --reset`);
      process.exit(4);
    }
    userId = existing.rows[0].id;
  } else {
    const ins = await c.query(
      `insert into users ("nationalCode","firstName","lastName","passwordHash","isActive","mustChangePassword")
       values ($1,$2,$3,$4,1,$5) returning id`,
      [nationalCode, firstName, lastName, await hashPassword(password), forceChange ? 1 : 0]);
    userId = ins.rows[0].id;
  }
  if (existing.rows.length) {
    await c.query('update users set "passwordHash"=$1, "mustChangePassword"=$2, isActive=1 where id=$3',
      [await hashPassword(password), forceChange ? 1 : 0, userId]);
  }
  await c.query('insert into user_roles ("userId","roleId") values ($1,$2) on conflict do nothing', [userId, roleRow.rows[0].id]);
  // نشست‌های قبلی باطل شود تا رمز تازه تنها راه ورود باشد
  await c.query('delete from sessions where "userId"=$1', [userId]);

  const body = [
    `# ساخته‌شده: ${new Date().toISOString()}`,
    `# یک‌بار بخوانید و این فایل را پاک کنید:  rm ${credFile}`,
    `NATIONAL_CODE=${nationalCode}`,
    `PASSWORD=${password}`,
    `ROLE=${role}`,
    `FORCE_PASSWORD_CHANGE=${forceChange ? 1 : 0}`,
    '',
  ].join('\n');
  writeFileSync(credFile, body, { mode: 0o600 });
  if (existsSync(credFile)) { /* پوشش mode روی برخی فایل‌سیستم‌ها اعمال نمی‌شود */ }

  console.log(`✅ حساب «${fullName}» (کد ملی ${nationalCode}) با نقش ${role} آماده شد · userId=${userId}`);
  console.log(`   رمز در ${credFile} (chmod 600) — بعد از اولین ورود این فایل را پاک کنید.`);
  if (forceChange) console.log('   اولین ورود، تغییر رمز اجباری است (صفحهٔ «تغییر رمز»).');
  if (flag('--show')) {
    console.log('');
    console.log('⚠ فقط برای اپراتور — در لاگ/CI نگهش ندارید:');
    console.log(`   کد ملی: ${nationalCode}`);
    console.log(`   رمز   : ${password}`);
  }
  if (password.length < POLICY.minLenDb) {
    console.warn(`⚠ رمز کوتاه‌تر از سیاست پروداکشن (${POLICY.minLenDb}) است — تغییر اجباری آن را در اولین ورود حل می‌کند.`);
  }
} finally {
  await c.end();
}

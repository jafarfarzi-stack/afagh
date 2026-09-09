/**
 * ════════════════════════════════════════════════════════════════════════
 *  گیت «Release Hardening» — سیاست سکرت‌ها + مسیر پروداکشن (P0-1 تا P0-4)
 *
 *  دو بخش:
 *   ۱) رفتار خط فرمانِ scripts/lib/secret-policy.mjs (پذیرش/رد .env) — همان چیزی
 *      که `make check-env` و گیت CI می‌زنند؛ پس تست، خودِ دروازه را می‌سنجد.
 *   ۲) دروازه‌های استاتیک روی فایل‌های استقرار — تا «پیش‌فرض ناامن» یا
 *      «drizzle-kit push در پروداکشن» دیگر به مخزن برنگردد.
 * ════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { assertProdSecrets, checkDbSecret } from '../src/lib/secret-guard';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT = path.join(HERE, '..');
const ROOT = path.join(NEXT, '..');
const POLICY_JS = path.join(NEXT, 'scripts/lib/secret-policy.mjs');
const read = (p: string): string => readFileSync(p, 'utf8');

let pass = 0;
let fail = 0;
const t = (name: string, fn: () => void): void => {
  try {
    fn();
    pass++;
    console.log('  ✓ ' + name);
  } catch (e: any) {
    fail++;
    console.log('  ✗ ' + name + '\n      ' + (e?.message ?? e));
  }
};

/** env را موقتاً می‌گذارد (برای آزمون گاردی که در زمان فراخوانی env می‌خواند) */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const before: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) before[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

const TMP = mkdtempSync(path.join(os.tmpdir(), 'afagh-policy-'));
const runPolicy = (envFile: string, extra: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [POLICY_JS, '--check', envFile], {
    encoding: 'utf8',
    env: { ...process.env, ...extra },
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const writeEnv = (name: string, values: Record<string, string>): string => {
  const f = path.join(TMP, name);
  writeFileSync(f, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  return f;
};
const gen = (): string => execFileSync(process.execPath, [POLICY_JS, '--gen', '28'], { encoding: 'utf8' }).trim();

console.log('\n══ ۱) دروازهٔ سیاست سکرت‌ها (خط فرمان) ══');

t('--gen رمز ۲۸+ کاراکتری می‌سازد که خودِ سیاست را قبول می‌کند', () => {
  const v = gen();
  assert.equal(v.length, 28);
  assert.ok(!/[^A-Za-z0-9]/.test(v), 'آلفابت بدون کاراکتر خاص تا در shell/compose امن باشد');
  for (let i = 0; i < 12; i++) {
    const g = gen();
    assert.equal(check(g).code, 0, 'رمز تصادفی باید پذیرفته شود: ' + g);
  }
});
function check(pw: string) {
  return runPolicy(writeEnv('ok.env', {
    POSTGRES_PASSWORD: pw, AFAGH_APP_DB_PASSWORD: pw, MINIO_ROOT_PASSWORD: pw,
  }));
}

t('.env سالم با سه رمز قوی → exit 0', () => {
  const f = writeEnv('good.env', {
    POSTGRES_PASSWORD: gen(), AFAGH_APP_DB_PASSWORD: gen(), MINIO_ROOT_PASSWORD: gen(),
  });
  const r = runPolicy(f);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /سازگارند/);
});

t('مقادیر نمونهٔ CHANGE_ME → exit 1 و پیام فارسیِ همان متغیر', () => {
  const f = writeEnv('sample.env', {
    POSTGRES_PASSWORD: 'CHANGE_ME_STRONG_PASSWORD',
    AFAGH_APP_DB_PASSWORD: 'CHANGE_ME_STRONG_APP_DB_PASSWORD',
    MINIO_ROOT_PASSWORD: 'CHANGE_ME_STRONG_SECRET',
  });
  const r = runPolicy(f);
  assert.equal(r.code, 1);
  assert.match(r.out, /نقض شد/);
  for (const k of ['POSTGRES_PASSWORD', 'AFAGH_APP_DB_PASSWORD', 'MINIO_ROOT_PASSWORD']) {
    assert.match(r.out, new RegExp(k + ' هنوز مقدار نمونه'), k + ' باید به‌عنوان مقدار نمونه گزارش شود');
  }
});

t('پیش‌فرض‌های ضعیف compose («afagh-app-pass» و…) رد می‌شوند', () => {
  const r = runPolicy(writeEnv('weak.env', {
    POSTGRES_PASSWORD: 'afagh', AFAGH_APP_DB_PASSWORD: 'afagh-app-pass', MINIO_ROOT_PASSWORD: 'afagh-secret',
  }));
  assert.equal(r.code, 1);
  assert.match(r.out, /پیش‌فرض‌های ضعیف شناخته‌شده/);
  assert.match(r.out, /afagh-app-pass/);
});

t('رمز کوتاه یا با تکرار چهارتایی رد می‌شود؛ خالی همیشه رد است', () => {
  assert.equal(runPolicy(writeEnv('s.env', {
    POSTGRES_PASSWORD: 'afagh-app-pass-12', AFAGH_APP_DB_PASSWORD: 'abcdefghijklmno', MINIO_ROOT_PASSWORD: 'abcdefghijklmno',
  })).code, 1);
  const short = runPolicy(writeEnv('s2.env', {
    POSTGRES_PASSWORD: gen(), AFAGH_APP_DB_PASSWORD: 'a'.repeat(24), MINIO_ROOT_PASSWORD: gen(),
  }));
  assert.equal(short.code, 1);
  assert.match(short.out, /تکرار چهارتایی/);
  const empty = runPolicy(writeEnv('s3.env', { POSTGRES_PASSWORD: gen(), AFAGH_APP_DB_PASSWORD: '', MINIO_ROOT_PASSWORD: gen() }));
  assert.equal(empty.code, 1);
  assert.match(empty.out, /خالی است/);
});

t('ALLOW_WEAK_SECRETS=1 فقط برای توسعه: نمونه/ضعیف هشدار می‌شود، خالی نه', () => {
  const weak = runPolicy(writeEnv('w.env', {
    POSTGRES_PASSWORD: 'afagh', AFAGH_APP_DB_PASSWORD: 'CHANGE_ME', MINIO_ROOT_PASSWORD: 'afagh-secret',
  }), { ALLOW_WEAK_SECRETS: '1' });
  assert.equal(weak.code, 0, weak.out);
  const empty = runPolicy(writeEnv('w2.env', {
    POSTGRES_PASSWORD: gen(), AFAGH_APP_DB_PASSWORD: '', MINIO_ROOT_PASSWORD: gen(),
  }), { ALLOW_WEAK_SECRETS: '1' });
  assert.equal(empty.code, 1, 'خالی‌بودن حتی در توسعه هم پذیرفته نمی‌شود');
});

t('فایل ناموجود → exit 2 (نه عبور بی‌صدا)', () => {
  const r = runPolicy(path.join(TMP, 'nope.env'));
  assert.equal(r.code, 2);
});

console.log('\n══ ۱-ب) گارد سکرت داخل کد اپ (P0-1 — لایهٔ نهایی) ══');

t('checkDbSecret: ضعیف/نمونه/کوتاه/خالی رد، قوی قبول', () => {
  assert.equal(checkDbSecret('X', 'afagh-app-pass').ok, false);
  assert.equal(checkDbSecret('X', 'CHANGE_ME_STRONG_APP_DB_PASSWORD').ok, false);
  assert.equal(checkDbSecret('X', 'short24').ok, false);
  assert.equal(checkDbSecret('X', undefined).ok, false);
  assert.equal(checkDbSecret('X', 'Zk9dnHtr7xQm2vwLp4Yb6c8f').ok, true);
  const weak = checkDbSecret('X', 'afagh', true);
  assert.equal(weak.ok, true);
  assert.equal((weak as { weak?: boolean }).weak, true, 'با allowWeak فقط هشدار است');
});

t('assertProdSecrets: در production با رمز ضعیف startup بسته می‌شود', () => {
  withEnv({
    NODE_ENV: 'production', NEXT_PHASE: '',
    AFAGH_APP_DB_PASSWORD: 'afagh-app-pass',
    DATABASE_URL: 'postgres://afagh:some-strong-owner-secret-9f3k2l@db:5432/afagh_db',
  }, () => assert.throws(() => assertProdSecrets(), /پیش‌فرض‌های ضعیف/));
  const strong = gen();
  withEnv({
    NODE_ENV: 'production', NEXT_PHASE: '',
    AFAGH_APP_DB_PASSWORD: strong,
    DATABASE_URL: `postgres://afagh:${strong}@db:5432/afagh_db`,
  }, () => assert.doesNotThrow(() => assertProdSecrets()));
  // رمز ضعیف فقط در URL (نه ENV) هم گرفته می‌شود
  withEnv({
    NODE_ENV: 'production', NEXT_PHASE: '', AFAGH_APP_DB_PASSWORD: undefined,
    DATABASE_URL: 'postgres://afagh:afagh-app-pass@db:5432/afagh_db',
    DATABASE_URL_APP: 'postgres://afagh_app:afagh-app-pass@db:5432/afagh_db',
  }, () => assert.throws(() => assertProdSecrets()));
  withEnv({ NODE_ENV: 'development', AFAGH_APP_DB_PASSWORD: 'afagh' },
    () => assert.doesNotThrow(() => assertProdSecrets()));
  withEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-build', AFAGH_APP_DB_PASSWORD: 'afagh' },
    () => assert.doesNotThrow(() => assertProdSecrets(), 'در build نباید جلو بزند'));
});

t('فهرست ضعیفِ کد اپ و اسکریپت‌ها واگرا نمی‌شود', () => {
  const guard = read(path.join(NEXT, 'src/lib/secret-guard.ts'));
  const policy = read(POLICY_JS);
  const grab = (src: string) => (src.match(/'afagh',[^\]]*\]/) || [''])[0];
  const norm = (chunk: string) => chunk.split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
  const a = norm(grab(guard)), b = norm(grab(policy));
  assert.ok(a.length >= 8, 'فهرست guard خوانده نشد');
  assert.ok(b.length >= 8, 'فهرست policy خوانده نشد');
  assert.deepEqual(a, b, 'فهرست پیش‌فرض‌های ضعیف در دو لایه فرق کرده است');
});

console.log('\n══ ۲) دروازه‌های استاتیک استقرار ══');
const COMPOSE = path.join(ROOT, 'docker-compose.yml');
const DOCKERFILE = path.join(NEXT, 'Dockerfile');
const DEPLOY = path.join(ROOT, 'deploy-debian.sh');
const MAKEFILE = path.join(ROOT, 'Makefile');

t('P0-1: compose هیچ پیش‌فرضی برای رمزهای دیتابیس ندارد و با :? اجباری‌شان می‌کند', () => {
  const s = read(COMPOSE);
  assert.doesNotMatch(s, /POSTGRES_PASSWORD:-/, 'پیش‌فرض POSTGRES_PASSWORD برگشته');
  assert.doesNotMatch(s, /AFAGH_APP_DB_PASSWORD:-/, 'پیش‌فرض AFAGH_APP_DB_PASSWORD برگشته');
  assert.match(s, /POSTGRES_PASSWORD:\?/, 'رمز مالک اجباری نیست');
  assert.match(s, /AFAGH_APP_DB_PASSWORD:\?/, 'رمز afagh_app اجباری نیست');
  // پیام داخل ${VAR:?…} نباید «: » داشته باشد، وگرنه YAML می‌شکند
  for (const m of s.matchAll(/\$\{[A-Z_]+:\?[^}]*\}/g)) {
    assert.ok(!m[0].includes(': '), 'پیام compose نباید دونقطه+فاصله داشته باشد: ' + m[0]);
  }
  // سیاستِ one‑source: نه خودِ مقادیر، نه فهرست ضعیف‌ها در compose تکرار نشود
  assert.ok(!/afagh-app-pass/.test(s), 'پیش‌فرض ناامن در compose باقی مانده');
});

t('P0-2: پشتیبان در volume ماندگار است و پیش از تغییر اسکیما راستی‌آزمایی می‌شود', () => {
  const s = read(COMPOSE);
  assert.match(s, /afagh_backups:\/backups/, 'volume پشتیبان به migrator وصل نیست');
  assert.match(s, /^ {2}afagh_backups:/m, 'volume در بخش volumes تعریف نشده');
  const d = read(DOCKERFILE);
  assert.ok(d.indexOf('migrate-db.mjs') < d.indexOf('verify-backup.mjs'), 'راستی‌آزمایی پشتیبان بعد از مهاجرت است');
  assert.match(d, /verify-backup\.mjs/, 'گام راستی‌آزمایی پشتیبان از Dockerfile رفته');
  const b = read(path.join(NEXT, 'scripts/backup-db.mjs'));
  assert.match(b, /pg_restore/, 'پشتیبان با pg_restore --list راستی‌آزمایی نمی‌شود');
  assert.match(b, /\.sha256/, 'امضای sha256 نوشته نمی‌شود');
  assert.match(b, /LATEST/, 'فایل LATEST نوشته نمی‌شود');
  assert.match(b, /AFAGH_BACKUP_KEEP/, 'retention ندارد');
  assert.match(b, /pickOutDir/, 'مسیر نوشتنی جایگزین ندارد (در نبود /backups شکست می‌خورد)');
});

t('P0-3: پروداکشن با مهاجرت نسخه‌دار می‌رود، نه drizzle-kit push', () => {
  const d = read(DOCKERFILE);
  // فقط دستورهای واقعی (نه توضیح «چرا push نه») ملاک است
  const code = d.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(code, /drizzle-kit push/, 'push دوباره به ایمیج پروداکشن راه یافت');
  assert.match(code, /node scripts\/migrate-db\.mjs/, 'گام مهاجرت در CMD نیست');
  assert.match(d, /node scripts\/migrate-db\.mjs/, 'migrator مهاجرت نسخه‌دار را صدا نمی‌زند');
  const m = read(path.join(NEXT, 'scripts/migrate-db.mjs'));
  assert.match(m, /AFAGH_MIGRATE_NO_AUTO_BASELINE/, 'baseline خودکار برای دیتابیس‌های push‌ساخته ندار');
  assert.match(m, /CREATE TABLE IF NOT EXISTS drizzle\.__drizzle_migrations/, 'دفتر مهاجرت ساخته نمی‌شود');
  assert.match(m, /backup-db\.mjs/, 'مهاجرت، پشتیبان را اول صدا نمی‌زند');
  assert.match(m, /process\.exit\(3\)/, 'شکست پشتیبان مهاجرت را متوقف نمی‌کند');
});

t('P0-4: رمز ثابت در مسیر نصب چاپ نمی‌شود و حساب اولیه با CLI ساخته می‌شود', () => {
  const s = read(DEPLOY);
  const printed = s.split('\n').filter((l) => /^\s*(echo|ok|warn|printf|cat)\b/.test(l));
  const leak = printed.filter((l) => /123456/.test(l) && !/قفل/.test(l));
  assert.deepEqual(leak, [], 'رمز ثابت در خروجی نصب چاپ می‌شود: ' + leak.join(' | '));
  assert.match(s, /create-admin\.mjs/, 'اسکریپت حساب اولیه صدا زده نمی‌شود');
  assert.match(s, /chmod 600 "\$CRED_FILE"/, 'فایل credential شش‌به‌هشتاد نیست');
  assert.match(s, /-ge 24/, 'حداقل طول ۲۴ در سیاست نصب نیست');
  assert.match(s, /\|123456\|/, 'رمز دمو باید در فهرست «ضعیف» باشد نه در دستورالعمل نصب');
  const ca = read(path.join(NEXT, 'scripts/create-admin.mjs'));
  assert.match(ca, /mustChangePassword/, 'تغییر اجباری رمز تنظیم نمی‌شود');
  assert.match(ca, /mode: 0o600/, 'فایل رمز با مجوز ۰۶۰۰ نوشته نمی‌شود');
  assert.match(ca, /delete from sessions/, 'نشست‌های پیشین باطل نمی‌شوند');
  assert.match(ca, /AFAGH_SCRYPT_N/, 'سازگاری با پارامتر scrypt برنامه ندارد');
});

t('Makefile همان سیاست مشترک را می‌زند و دستورهای DR را دارد', () => {
  const s = read(MAKEFILE);
  assert.match(s, /secret-policy\.mjs --check/, 'check-env سیاست مشترک را صدا نمی‌زند');
  assert.match(s, /^verify-backup:/m, 'هدف verify-backup نیست');
  assert.match(s, /^drill:/m, 'هدف DR drill نیست');
  assert.match(s, /^admin:/m, 'هدف admin نیست');
  assert.match(s, /^copy-backups-to-host:/m, 'هدف کپی پشتیبان به میزبان نیست');
});

t('اسکریپت‌های تازه موجود و از نظر سینتکس سالم‌اند', () => {
  for (const f of ['scripts/lib/secret-policy.mjs', 'scripts/backup-db.mjs', 'scripts/verify-backup.mjs',
                   'scripts/create-admin.mjs', 'scripts/migrate-db.mjs', 'scripts/hardening.mjs']) {
    const p = path.join(NEXT, f);
    assert.ok(existsSync(p), f + ' وجود ندارد');
    assert.match(read(p), /══/, f + ' سرصفحهٔ توضیحی ندارد');
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(r.status, 0, f + ' سینتکس ندارد:\n' + r.stderr);
  }
});

t('hardening پیش از اعمال رمز روی نقش، سیاست را می‌سنجد (fail-closed)', () => {
  const h = read(path.join(NEXT, 'scripts/hardening.mjs'));
  const at = h.indexOf("checkSecret('AFAGH_APP_DB_PASSWORD'");
  assert.ok(at > 0, 'بررسی سیاست رمز در hardening نیست');
  assert.ok(h.indexOf('process.exit(1)', at) < h.indexOf('client.query(sql'), 'رمز پیش از بررسی اعمال می‌شود');
  assert.match(read(path.join(NEXT, 'src/db/pg-hardening.sql')), /__AFAGH_APP_PASSWORD__/);
});

rmSync(TMP, { recursive: true, force: true });
console.log(`\n🏁 release-hardening: ${pass} ✓ / ${fail} ✗`);
if (fail) process.exit(1);

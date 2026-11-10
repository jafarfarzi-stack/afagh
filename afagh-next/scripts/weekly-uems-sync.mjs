#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  weekly-uems-sync — اورکستراتور همگامسازی هفتگی  UEMS (SQL قدیمی) → آفاق (PG)
 *
 *  چه میکند:
 *    ۱) آدرس/اتصال «دیتابیسِ پشتیبان» (UEMS) را از کاربر میگیرد (یا از آرگومان).
 *    ۲) از UEMS استخراج میکند (tuition / tariff / دادهٔ آموزشی) → TSV.
 *    ۳) همهٔ اطلاعات (مالی + آموزشی) را در دیتابیس آفاق بارگذاری میکند.
 *    ۴) در انتها یک گزارش یکپارچه چاپ میکند.
 *
 *  اجرای تعاملی (آدرس دیتابیس پشتیبان را میپرسد):
 *    node scripts/weekly-uems-sync.mjs
 *
 *  اجرای زمانبندیشده (بدون پرسش — برای Task Scheduler / cron):
 *    node scripts/weekly-uems-sync.mjs --yes \
 *      --uems-server "localhost\\AFAGH" --uems-user sa --uems-pass "..." --uems-db uems \
 *      --target-host 10.10.10.98 --target-pass "PG_PASSWORD"
 *
 *  پرچمها:
 *    --yes            غیرتعاملی (بدون پرسش / بدون تأیید) — برای زمانبندی
 *    --plan           فقط دستوراتی که اجرا میشوند را چاپ میکند و خارج میشود
 *    --fin-dir <p>    مسیر TSVهای مالی (پیشفرض: D:\backups\fin_export)
 *    --skip-extract   از TSVهای موجود استفاده میکند (استخراج را رد میزند)
 *    --target-host / --target-port / --target-db / --target-user
 *    --target-pass <pw>  رمز Postgres مقصد (مستقیم؛ توصیهشده روی ویندوز)
 *    --target-env <p>    مسیر یک فایل .env «محلی» حاوی POSTGRES_PASSWORD
 *                        (جایگزین --target-pass؛ دیگر نیازی به /root/afagh/.env سرور نیست)
 *    --uems-server / --uems-user / --uems-pass / --uems-db  (در حالت --yes الزامی)
 *    --sqlcmd <p>     مسیر sqlcmd.exe (اگر روی PATH نیست)
 *    --uni <n>        شناسهٔ دانشگاه (پیشفرض ۱)
 *    --work-dir <p>   پوشهٔ کاری خروجی TSV (پیشفرض: پوشهٔ موقت سیستم)
 *
 *  نکتهٔ مهم (اتصال مقصد): --target-host باید از «همین سیستمی که اسکریپت روی آن
 *  اجرا میشود» قابل دسترس باشد. مقدار پیشفرض 172.20.0.3 یک IP داخلی Docker روی
 *  سرور است و از ویندوز دیده نمیشود → IP سرور، پورت exposeشده، یا تونل SSH بدهید.
 *  رمز مقصد هرگز از /root/afagh/.env سرور خوانده نمیشود؛ اسکریپت یک فایل env موقت
 *  محلی میسازد و آن را به اسکریپتهای migrate میدهد، سپس پاک میکند.
 *
 *  ایمنی: اسکریپتهای migrate دارای گیتِ تطبیق (≥۹۰٪) و درج ایدهپاتنت هستند؛
 *  در حالت تعاملی پیش از هرگونه نوشتن، مقصد بهوضوح نمایش داده شده و تأیید میشود.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SCRIPT = (n) => join(__dirname, n);

// ── پارس آرگومان ──────────────────────────────────────────────────────────
const raw = process.argv.slice(2);
const A = {};
for (let i = 0; i < raw.length; i++) {
  if (raw[i].startsWith('--')) {
    const k = raw[i].slice(2);
    A[k] = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
  }
}
const YES = A.yes === 'true';
const PLAN = A.plan === 'true';
const SKIP_EXTRACT = A['skip-extract'] === 'true';
const UNI = Number(A.uni || 1);
const FIN_DIR = A['fin-dir'] || 'D:\\backups\\fin_export';
const SQLCMD = A.sqlcmd || process.env.SQLCMD || 'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe';

// ── پرسش تعاملی ──────────────────────────────────────────────────────────
async function ask(rl, q, dflt) {
  const suffix = dflt ? ` [${dflt}] ` : ' ';
  const ans = (await rl.question(q + suffix)).trim();
  return ans || dflt || '';
}

async function gatherInteractive(plan) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const out = {};
  console.log('\n── آدرس دیتابیسِ پشتیبان (UEMS / SQL Server) را وارد کنید ──');
  out.uemsServer = await ask(rl, '  server (مثال localhost\\AFAGH یا 127.0.0.1,62133):', 'localhost\\AFAGH');
  out.uemsDb = await ask(rl, '  database:', 'uems');
  out.uemsUser = await ask(rl, '  user:', 'sa');
  out.uemsPass = await ask(rl, '  password:', '');
  console.log('\n── مقصد: دیتابیس آفاق (Postgres) ──');
  out.targetHost = await ask(rl, '  host قابل دسترس از این سیستم (IP سرور/تونل SSH):', '172.20.0.3');
  out.targetSecret = plan ? '' : await ask(rl, '  رمز Postgres مقصد (یا مسیر فایل .env محلی):', '');
  rl.close();
  return out;
}

function gatherNonInteractive() {
  const need = ['uems-server', 'uems-user', 'uems-db'];
  // password may be empty for trusted auth; warn but allow
  const missing = need.filter((k) => !A[k]);
  if (missing.length) {
    console.error('در حالت --yes این آرگومانها الزامیاند: --' + missing.join(' --'));
    process.exit(2);
  }
  return {
    uemsServer: A['uems-server'],
    uemsDb: A['uems-db'],
    uemsUser: A['uems-user'],
    uemsPass: A['uems-pass'] || '',
    targetHost: A['target-host'] || '172.20.0.3',
    targetSecret: A['target-pass'] || A['target-env'] || '',
  };
}

// ── کمکها ────────────────────────────────────────────────────────────────
/** رمز مقصد: یا مستقیم (--target-pass)، یا مسیر یک فایل .env محلی (--target-env)،
 *  یا مقداری که بهصورت تعاملی وارد شده. اگر مقدار یک فایل موجود باشد،
 *  POSTGRES_PASSWORD را از آن میخوانیم؛ در غیر این صورت همان رشته رمز است.
 *  هیچ وابستهای به /root/afagh/.env سرور وجود ندارد. */
function resolvePassword(cfg, plan) {
  if (plan) return '***';
  const v = String(cfg.targetSecret || '').trim();
  if (!v) {
    console.error('رمز Postgres مقصد مشخص نشد. یکی از --target-pass / --target-env را بدهید (یا در حالت تعاملی وارد کنید).');
    process.exit(2);
  }
  if (existsSync(v)) {
    const txt = readFileSync(v, 'utf8');
    const m = txt.match(/^POSTGRES_PASSWORD=(.*)$/m);
    if (!m) { console.error('POSTGRES_PASSWORD در ' + v + ' یافت نشد'); process.exit(2); }
    return m[1].replace(/\r$/, '');
  }
  return v;
}

/** extract-legacy-education خروجی را UTF-16LE مینویسد (sqlcmd -u)؛ برای خواندنِ
 *  صحیحِ عنوانهای فارسی توسط migrate، آن‌ها را به UTF-8 تبدیل میکنیم. */
function convertEduDirToUtf8(dir) {
  if (!existsSync(dir)) return 0;
  const dec = new TextDecoder('utf-16le');
  const enc = new TextEncoder();
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsv')) continue;
    const p = join(dir, f);
    const buf = readFileSync(p);
    // فقط فایلهای UTF-16LE (BOM FF FE) را تبدیل میکنیم
    const isU16 = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
    if (!isU16) continue;
    const text = dec.decode(buf).replace(/^﻿/, '');
    writeFileSync(p, enc.encode(text));
    n++;
  }
  return n;
}

function runStep(step, env) {
  const t0 = Date.now();
  console.log(`\n──────── [${step.phase}] ${step.name} ────────`);
  console.log('  $ node ' + step.file + ' ' + step.args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' '));
  const r = spawnSync(process.execPath, [SCRIPT(step.file), ...step.args], {
    cwd: REPO,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 512,
  });
  const ms = Date.now() - t0;
  const out = String(r.stdout || '') + String(r.stderr || '');
  const last = out.split(/\r?\n/).filter((l) => l.trim()).slice(-12).join('\n');
  const ok = r.status === 0;
  if (!ok) console.error('  ⚠ خطا (exit ' + r.status + '):\n' + last);
  else console.log('  ✓ ' + (step.summary || 'انجام شد') + '  (' + ms / 1000 + 's)');
  return { name: step.name, phase: step.phase, ok, ms, last: ok ? '' : last };
}

// ── اجرا ─────────────────────────────────────────────────────────────────
async function main() {
  const cfg = YES ? gatherNonInteractive() : await gatherInteractive(PLAN);

  const workDir = A['work-dir'] || join(tmpdir(), 'uems-sync-' + Date.now());
  mkdirSync(workDir, { recursive: true });
  const ratesDir = join(workDir, 'uems_rates');
  const eduDir = join(workDir, 'uems_edu');
  mkdirSync(ratesDir, { recursive: true });
  mkdirSync(eduDir, { recursive: true });

  const pass = resolvePassword(cfg, PLAN);
  // فایل env موقت «محلی» برای اسکریپتهای migrate (جایگزین /root/afagh/.env سرور).
  const dbEnvPath = join(workDir, 'afagh.env');
  writeFileSync(dbEnvPath, `POSTGRES_PASSWORD=${pass}\n`, 'utf8');

  const targetPort = A['target-port'] || '5432';
  const targetDb = A['target-db'] || 'afagh_db';
  const targetUser = A['target-user'] || 'afagh';
  const DATABASE_URL = `postgres://${targetUser}:${encodeURIComponent(pass)}@${cfg.targetHost}:${targetPort}/${targetDb}`;

  // محیط پایه برای فرزندان
  const baseEnv = { ...process.env, DATABASE_URL, SQLCMD };
  // اسکریپتهای migrate از POSTGRES_PASSWORD در --db-env استفاده میکنند؛ همان فایل موقت را میدهیم.
  const migrateEnv = { ...baseEnv, POSTGRES_PASSWORD: pass };

  // ── تعریف گامها ───────────────────────────────────────────────────────
  const steps = [];
  if (!SKIP_EXTRACT) {
    steps.push({
      phase: 'extract', name: 'extract-uems-tuition (تعرفهٔ قوانین شهریه)', file: 'extract-uems-tuition.mjs',
      args: ['--server', cfg.uemsServer, '--user', cfg.uemsUser, '--pass', cfg.uemsPass, '--db', cfg.uemsDb, '--out', ratesDir],
      summary: 'TSV قوانین شهریه',
    });
    steps.push({
      phase: 'extract', name: 'extract-uems-tariff (تعرفهٔ تفصیلی ترم)', file: 'extract-uems-tariff.mjs',
      args: ['--server', cfg.uemsServer, '--user', cfg.uemsUser, '--pass', cfg.uemsPass, '--db', cfg.uemsDb, '--out', ratesDir],
      summary: 'TSV تعرفهٔ ترم + انواع درس',
    });
    steps.push({
      phase: 'extract', name: 'extract-legacy-education (دادهٔ آموزشی)', file: 'extract-legacy-education.mjs',
      args: ['--server', cfg.uemsServer, '--user', cfg.uemsUser, '--pass', cfg.uemsPass, '--db', cfg.uemsDb, '--out', eduDir],
      summary: 'TSVهای آموزشی (دروس/ارائه/نمرات/...)',
    });
  }

  // ── بارگذاری: مالی (از fin_export) + آموزشی (از استخراج) + تعرفه/قوانین ──
  steps.push({
    phase: 'load', name: 'import-uems-tuition (قوانین شهریه → tuition_rules)', file: 'import-uems-tuition.mjs',
    args: ['--in', join(ratesDir, 'uems_tuition_rules.tsv'), '--apply', '--university', String(UNI)],
    summary: 'قوانین شهریه',
  });
  steps.push({
    phase: 'load', name: 'import-uems-tariff (تعرفهٔ ترم → tuition_term_tariff)', file: 'import-uems-tariff.mjs',
    args: ['--tariff', join(ratesDir, 'uems_term_tariff.tsv'), '--lessons', join(ratesDir, 'uems_lesson_types.tsv'), '--apply', '--university', String(UNI)],
    summary: 'تعرفهٔ ترم + انواع درس مالی',
  });
  steps.push({
    phase: 'load', name: 'migrate-legacy-finance (دفتر مالی: TermAms/StdPays → student_ledger)', file: 'migrate-legacy-finance.mjs',
    args: ['--dir', FIN_DIR, '--uni', String(UNI), '--apply', '--db-host', cfg.targetHost, '--db-env', dbEnvPath],
    summary: 'دفتر مالی دانشجو + تسویهحساب',
  });
  steps.push({
    phase: 'load', name: 'migrate-legacy-education (آموزشی → courses/offerings/schedules/enrollments/grades)', file: 'migrate-legacy-education.mjs',
    args: ['--dir', eduDir, '--uni', String(UNI), '--apply', '--db-host', cfg.targetHost, '--db-env', dbEnvPath],
    summary: 'کاتالوگ دروس/ارائه/زمانبندی/نمرات',
  });

  // ── بنرِ مقصد/منبع ─────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  منبع (دیتابیس پشتیبان UEMS):  ' + cfg.uemsServer + ' / db=' + cfg.uemsDb);
  console.log('  مقصد (آفاق PG):               ' + cfg.targetHost + ':' + targetPort + ' / db=' + targetDb + ' / user=' + targetUser);
  console.log('  دادهٔ مالی از:                ' + FIN_DIR);
  console.log('  فایل env موقت مقصد:          ' + dbEnvPath);
  console.log('  پوشهٔ کاری:                   ' + workDir);
  console.log('  گامها:                        ' + steps.length + ' (' + steps.filter((s) => s.phase === 'extract').length + ' extract + ' + steps.filter((s) => s.phase === 'load').length + ' load)');
  if (cfg.targetHost === '172.20.0.3') {
    console.log('  ⚠ هشدار: 172.20.0.3 IP داخلی Docker سرور است و از ویندوز دیده نمیشود.');
    console.log('    → --target-host را به IP سرور / پورت exposeشده / تونل SSH تنظیم کنید.');
  }
  console.log('══════════════════════════════════════════════════════════════');

  if (PLAN) {
    console.log('\n[--plan] دستوراتی که اجرا میشوند:');
    for (const s of steps) {
      console.log('  [' + s.phase + '] ' + s.name + '\n    node ' + s.file + ' ' + s.args.map((a) => (/[ \\]/.test(a) ? `"${a}"` : a)).join(' '));
    }
    return;
  }

  if (!YES) {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const go = (await rl.question('\nبرای اجرای همگامسازی Enter بزنید (Ctrl+C برای انصراف): ')).trim();
    rl.close();
    if (go.toLowerCase() === 'n' || go.toLowerCase() === 'no') { console.log('لغو شد.'); process.exit(0); }
  }

  // ── اجرای گامها ───────────────────────────────────────────────────────
  const results = [];
  for (const s of steps) {
    // تبدیل UTF-16LE→UTF-8 برای خروجیهای آموزشی پس از استخراج
    if (s.file === 'extract-legacy-education.mjs') {
      const before = runStep(s, baseEnv);
      const conv = convertEduDirToUtf8(eduDir);
      if (conv) console.log('  ℹ تبدیل ' + conv + ' فایل آموزشی به UTF-8 (برای عنوانهای فارسی)');
      results.push(before);
      continue;
    }
    const env = s.file.startsWith('migrate-legacy') ? migrateEnv : baseEnv;
    results.push(runStep(s, env));
  }

  // پاکسازی فایل حاوی رمز (حتی در صورت خطا)
  try { unlinkSync(dbEnvPath); } catch { /* ignore */ }

  // ── گزارش نهایی ────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  گزارش نهایی همگامسازی UEMS → آفاق');
  console.log('══════════════════════════════════════════════════════════════');
  let allOk = true;
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    if (!r.ok) allOk = false;
    console.log(`  ${tag} [${r.phase}] ${r.name}  (${(r.ms / 1000).toFixed(1)}s)`);
    if (!r.ok && r.last) console.log('     ' + r.last.split('\n').join('\n     '));
  }
  console.log('────────────────────────────────────────────────────────────');
  console.log('  وضعیت کلی: ' + (allOk ? 'موفق ✓' : 'با خطا ✗'));
  console.log('  پوشهٔ کاری (TSVها): ' + workDir);
  console.log('══════════════════════════════════════════════════════════════');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

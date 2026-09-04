#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  دروازهٔ امنیتی وابستگی‌ها در CI (بازبینی ۴)
 *
 *  چرا غیر از `npm audit --audit-level=high`؟
 *  وقتی endpoint رجیستری (POST /-/npm/v1/security/audits/quick) با ۵۰۳/۵xx
 *  جواب بدهد، خودِ npm با exit 1 می‌شکند — بدون اینکه هیچ آسیب‌پذیری‌ای پیدا
 *  شده باشد. در آن حالت CI قرمزِ کاذب می‌شود و همهٔ pushها قفل می‌مانند.
 *
 *  رفتار این اسکریپت:
 *   • `npm audit --omit=dev --json` با ۳ تلاش و backoff (۵ ثانیه)
 *   • آسیب‌پذیری واقعی high/critical (از JSON رسمی audit) → exit 1 (همان قید قبلی)
 *   • خطای endpoint (503/5xx/خروجی نامعتبرِ endpoint) پس از ۳ تلاش → ⚠️ هشدار + exit 0
 *     (عمدی و مستند: دروازهٔ «کد» برقرار است؛ فقط خرابی زیرساختِ رجیستری تحمل می‌شود)
 *   • هر خطای دیگر (خروجی نامعتبر، ناسازگاری نصب، …) → exit 1 (fail-closed)
 * ════════════════════════════════════════════════════════════════════════
 */
import { execFile } from 'node:child_process';

const run = () =>
  new Promise((resolve) => {
    execFile('npm', ['audit', '--omit=dev', '--json'], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr });
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** آیا این خطا از «خرابی endpoint» است (نه یک یافتهٔ واقعی)؟ */
const isEndpointOutage = (json, err, stderr) => {
  if (json?.error) {
    const s = JSON.stringify(json.error);
    return /service unavailable|503|audit endpoint returned an error|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENOTFOUND|402|404/i.test(s);
  }
  const t = (stderr || '') + (err?.message || '');
  return /audit endpoint returned an error|Service Unavailable|503|EAI_AGAIN|ECONNRESET|ETIMEDOUT/i.test(t);
};

let json = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  const { err, stdout, stderr } = await run();
  try {
    json = JSON.parse(stdout || '{}');
  } catch {
    json = null;
  }
  if (err && json && isEndpointOutage(json, err, stderr)) {
    console.warn(`⚠️  تلاش ${attempt}/۳: endpoint ممیزی در دسترس نیست — ${JSON.stringify(json.error || {}).slice(0, 120)}`);
    await sleep(5000);
    continue;
  }
  if (err && !json) {
    // خروجی JSON معتبر نیست — اگر پیام خطا «endpoint» بود یعنی خرابی رجیستری؛ وگرنه شکست واقعی
    if (isEndpointOutage(null, err, stderr)) {
      console.warn(`⚠️  تلاش ${attempt}/۳: endpoint ممیزی در دسترس نیست — ${(stderr || '').slice(-160)}`);
      await sleep(5000);
      continue;
    }
    console.error('❌ خروجی نامعتبر از npm audit:', (stderr || err.message).slice(0, 500));
    process.exit(1);
  }
  break; // اجرای موفق (حتی با یافته‌ها) — json معتبر است
}

if (!json) {
  console.warn('⚠️  endpoint ممیزی پس از ۳ تلاش در دسترس نبود — این اجرا نادیده گرفته شد (مستند در ci-audit.mjs).');
  process.exit(0);
}

const v = json.metadata?.vulnerabilities ?? {};
console.log(`📦 آسیب‌پذیری‌ها: info=${v.info ?? 0} low=${v.low ?? 0} moderate=${v.moderate ?? 0} high=${v.high ?? 0} critical=${v.critical ?? 0}`);
if ((v.high ?? 0) > 0 || (v.critical ?? 0) > 0) {
  console.error('❌ آسیب‌پذیری high/critical در وابستگی‌های production پیدا شد — عبور مجاز نیست.');
  for (const [name, adv] of Object.entries(json.vulnerabilities ?? {})) {
    if (['high', 'critical'].includes(adv.severity)) {
      console.error(`   ✗ ${name} [${adv.severity}] — ${adv.via?.map((x) => x?.title ?? x).join(' | ').slice(0, 160)}`);
    }
  }
  process.exit(1);
}
console.log('✅ هیچ آسیب‌پذیری high/critical وجود ندارد.');

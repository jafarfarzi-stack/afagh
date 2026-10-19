#!/usr/bin/env node
/**
 * فاز ۵ — اسموک‌تستِ پس از استقرار (Post-Deploy Smoke Test)
 *
 * هدف: پس از هر استقرار/ری‌استارت، در چند ثانیه بفهمیم سرویس «بالا» است و
 * مسیرهای حیاتی و هدرهای امنیتی سرِ جای خود هستند. این اسکریپت فقط «خواندنی»
 * است (GET)، هیچ داده‌ای تغییر نمی‌دهد، هیچ وابستگی بیرونی ندارد و روی Node
 * ۲۰+ (fetch سراسری) اجرا می‌شود.
 *
 * استفاده:
 *   node scripts/phase5/smoke-test.mjs
 *   SMOKE_BASE_URL=https://afagh.example.ir node scripts/phase5/smoke-test.mjs
 *   node scripts/phase5/smoke-test.mjs https://afagh.example.ir
 *
 * متغیرهای محیطی:
 *   SMOKE_BASE_URL    نشانی پایه (پیش‌فرض http://127.0.0.1:8080)
 *   SMOKE_TIMEOUT_MS  مهلت هر درخواست به میلی‌ثانیه (پیش‌فرض 10000)
 *   SMOKE_BEHIND_PROXY=1  اگر پشت Caddy/پروکسی هستید (هدرهای لبه اختیاری‌تر می‌شوند)
 *
 * کد خروج: هر FAIL ⇒ کد ۱ (تا در اسکریپت استقرار/CI قابل استفاده باشد).
 *          WARN هرگز باعث شکست نمی‌شود.
 */

const RAW_BASE = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080';
const TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '10000', 10) || 10000;
const BEHIND_PROXY = process.env.SMOKE_BEHIND_PROXY === '1';

const base = (() => {
  try {
    return new URL(RAW_BASE);
  } catch {
    console.error(`❌ SMOKE_BASE_URL نامعتبر است: ${RAW_BASE}`);
    process.exit(2);
  }
})();
const BASE = base.origin;
const IS_HTTPS = base.protocol === 'https:';

/** رنگ‌آمیزی اختیاری (اگر خروجی به فایل/لوله برود، بی‌رنگ می‌شود). */
const isTTY = process.stdout.isTTY === true;
const c = (code, s) => (isTTY ? `\u001b[${code}m${s}\u001b[0m` : s);
const green = s => c('32', s);
const red = s => c('31', s);
const yellow = s => c('33', s);
const dim = s => c('2', s);

let failures = 0;
let warnings = 0;

function line(status, name, detail) {
  const tag = status === 'PASS' ? green('PASS') : status === 'FAIL' ? red('FAIL') : yellow('WARN');
  console.log(`[${tag}] ${name}${detail ? dim(' — ' + detail) : ''}`);
  if (status === 'FAIL') failures += 1;
  if (status === 'WARN') warnings += 1;
}

/** GET با مهلت؛ خطای شبکه را به‌جای پرتاب، در خروجی برمی‌گرداند. */
async function get(path) {
  const url = BASE + path;
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    // redirect: 'manual' → وضعیت واقعی را می‌بینیم و ۳۰x پنهان نمی‌شود.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: ac.signal,
      headers: { 'user-agent': 'afagh-smoke-test/1.0', accept: '*/*' },
    });
    const body = await res.text().catch(() => '');
    return {
      ok: true,
      status: res.status,
      headers: res.headers,
      location: res.headers.get('location'),
      body,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? `timeout > ${TIMEOUT_MS}ms` : String(err?.message || err), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** اگر پاسخ ۳۰x بود، یک‌بار تا مقصد درون همین میزبان دنبال می‌شود. */
async function getFollowing(path, maxHops = 3) {
  let current = path;
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await get(current);
    if (!res.ok) return res;
    if (res.status >= 300 && res.status < 400 && res.location) {
      try {
        const loc = new URL(res.location, BASE);
        if (loc.origin !== BASE) return res; // به میزبان دیگر → همان ۳۰x را گزارش کن
        current = loc.pathname + loc.search;
        continue;
      } catch {
        return res;
      }
    }
    return res;
  }
  return get(current);
}

function head(headers, name) {
  const v = headers.get(name);
  return v && v.trim() ? v.trim() : '';
}

async function main() {
  console.log(`🔎 اسموک‌تست افق — پایه: ${BASE}${IS_HTTPS ? '' : dim(' (بدون TLS)')}`);
  console.log('');

  // ── ۱) /login : کد ۲۰۰ + وجود فرم ورود ───────────────────────────────
  {
    const res = await getFollowing('/login');
    if (!res.ok) {
      line('FAIL', 'GET /login', res.error);
    } else if (res.status !== 200) {
      line('FAIL', 'GET /login', `انتظار 200، دریافت ${res.status}${res.location ? ' → ' + res.location : ''}`);
    } else {
      const html = res.body || '';
      const hasPassword = /name\s*=\s*["']password["']/i.test(html);
      const hasCode = /name\s*=\s*["']code["']/i.test(html);
      const hasForm = /<form[\s>]/i.test(html);
      if ((hasPassword || hasCode) && hasForm) {
        line('PASS', 'GET /login', `200، فرم ورود یافت شد (${res.ms}ms)`);
      } else {
        line('FAIL', 'GET /login', `200 اما فرم ورود پیدا نشد (form=${hasForm}, code=${hasCode}, password=${hasPassword})`);
      }
    }
  }

  // ── ۲) /api/health : کد ۲۰۰ + JSON سالم ──────────────────────────────
  {
    const res = await getFollowing('/api/health');
    if (!res.ok) {
      line('FAIL', 'GET /api/health', res.error);
    } else if (res.status !== 200) {
      line('FAIL', 'GET /api/health', `انتظار 200، دریافت ${res.status}`);
    } else {
      let data = null;
      try {
        data = JSON.parse(res.body);
      } catch {
        /* بدنه JSON نبود */
      }
      // پیاده‌سازی فعلی {status:'ok', db:'ok'} برمی‌گرداند؛ برای سازگاری با
      // قرارداد {ok:true} هر دو پذیرفته می‌شود.
      const healthy =
        data && (data.ok === true || data.status === 'ok' || data.status === 'healthy') && (data.db === undefined || data.db === 'ok');
      if (healthy) {
        line('PASS', 'GET /api/health', `200، ${JSON.stringify(data)} (${res.ms}ms)`);
      } else {
        line('FAIL', 'GET /api/health', `200 اما بدنه سالم نیست: ${res.body.slice(0, 200)}`);
      }
    }
  }

  // ── ۳) صفحهٔ عمومی استعلام: /verify-certificate یا /verify ────────────
  {
    const first = await getFollowing('/verify-certificate');
    if (first.ok && first.status === 200) {
      line('PASS', 'GET /verify-certificate', `200 (${first.ms}ms)`);
    } else {
      const second = await getFollowing('/verify');
      if (second.ok && second.status === 200) {
        line('PASS', 'GET /verify (جایگزین /verify-certificate)', `200 (${second.ms}ms)`);
      } else {
        const detail = !first.ok
          ? `${first.error}؛ جایگزین /verify: ${second.ok ? second.status : second.error}`
          : `/verify-certificate → ${first.status}؛ /verify → ${second.ok ? second.status : second.error}`;
        line('FAIL', 'صفحهٔ عمومی استعلام', detail);
      }
    }
  }

  // ── ۴) مسیر ناشناس : باید ۴۰۴ بدهد ───────────────────────────────────
  {
    const unknown = `/__smoke_unknown_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await get(unknown);
    if (!res.ok) {
      line('FAIL', `GET ${unknown}`, res.error);
    } else if (res.status === 404) {
      line('PASS', 'مسیر ناشناس ⇒ 404', `${unknown} (${res.ms}ms)`);
    } else {
      line('FAIL', 'مسیر ناشناس ⇒ 404', `انتظار 404، دریافت ${res.status}${res.location ? ' → ' + res.location : ''}`);
    }
  }

  // ── ۵) هدرهای امنیتی روی / (تحمل‌گرا) ─────────────────────────────────
  {
    const res = await getFollowing('/');
    if (!res.ok) {
      line('FAIL', 'هدرهای امنیتی /', res.error);
    } else {
      const h = res.headers;
      const xcto = head(h, 'x-content-type-options');
      const csp = head(h, 'content-security-policy');
      const referrer = head(h, 'referrer-policy');
      const hsts = head(h, 'strict-transport-security');
      const xfo = head(h, 'x-frame-options');
      const poweredBy = head(h, 'x-powered-by');

      // الزامی و همه‌جا (خودِ Next می‌فرستد): nosniff
      if (xcto.toLowerCase() === 'nosniff') {
        line('PASS', 'هدر X-Content-Type-Options', xcto);
      } else {
        line('FAIL', 'هدر X-Content-Type-Options', xcto ? `مقدار غیرمنتظره: ${xcto}` : 'غایب');
      }

      // الزامی: حداقل یکی از CSP یا Referrer-Policy
      if (csp || referrer) {
        line('PASS', 'هدر CSP/Referrer-Policy', `${csp ? 'CSP✓' : 'CSP✗'} ${referrer ? 'Referrer✓' : 'Referrer✗'}`);
      } else {
        line('FAIL', 'هدر CSP/Referrer-Policy', 'هیچ‌کدام یافت نشد');
      }

      // HSTS فقط روی HTTPS معنا دارد.
      if (IS_HTTPS) {
        if (hsts) line('PASS', 'هدر Strict-Transport-Security', hsts);
        else line('FAIL', 'هدر Strict-Transport-Security', 'روی HTTPS غایب است');
      } else {
        if (hsts) line('PASS', 'هدر Strict-Transport-Security', hsts);
        else line('WARN', 'هدر Strict-Transport-Security', 'روی HTTP معنا ندارد (پشت Caddy روی HTTPS لازم است)');
      }

      // لبه (Caddy) معمولاً این را اضافه می‌کند؛ نبودش روی اپ مستقیم عادی است.
      if (xfo) {
        line('PASS', 'هدر X-Frame-Options', xfo);
      } else {
        line('WARN', 'هدر X-Frame-Options', BEHIND_PROXY ? 'پشت پروکسی باید توسط Caddy تنظیم شود' : 'تقریباً لبه‌ای است (Caddy)');
      }

      // افشای فناوری: نباید X-Powered-By باشد.
      if (poweredBy) line('WARN', 'هدر X-Powered-By', `افشای فناوری: ${poweredBy}`);
      else line('PASS', 'عدم افشای X-Powered-By', 'غایب است');
    }
  }

  console.log('');
  if (failures === 0) {
    console.log(green(`✅ همهٔ بررسی‌ها موفق بودند${warnings ? ` (${warnings} هشدار)` : ''} — استقرار سالم به‌نظر می‌رسد.`));
    process.exit(0);
  } else {
    console.log(red(`❌ ${failures} بررسی ناموفق${warnings ? ` و ${warnings} هشدار` : ''} — استقرار را بازبینی کنید.`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(red(`خطای نامنتظر در اجرای اسموک‌تست: ${err?.stack || err}`));
  process.exit(2);
});

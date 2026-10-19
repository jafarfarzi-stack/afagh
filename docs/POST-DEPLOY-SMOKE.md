# اسموک‌تستِ پس از استقرار (Post-Deploy Smoke Test)

> **نسخهٔ سند:** 1.0 — **تاریخ:** 2026-10-19  
> **دامنه:** تأیید سلامت سامانهٔ آفاق بلافاصله پس از استقرار، ری‌استارت یا بازیابی  
> **مکمل:** `DEPLOY-SECURITY-CHECKLIST.md` · `INCIDENT-RESPONSE-RUNBOOK.md` · `RELEASE-READINESS.md`  
> **اسکریپت:** `afagh-next/scripts/phase5/smoke-test.mjs`

پس از هر **استقرار**، **ری‌استارت `app`** یا **بازیابی از پشتیبان**، این اسکریپت را بزنید تا در
چند ثانیه مطمئن شوید سرویس بالا آمده و مسیرهای حیاتی و هدرهای امنیتی سرِ جای خود هستند.
اسکریپت فقط **GET** می‌زند، هیچ داده‌ای را تغییر نمی‌دهد و **هیچ وابستگی بیرونی** (npm) ندارد.

---

## ۱) پیش‌نیازها

- Node.js نسخهٔ **۲۰ یا بالاتر** روی ماشین اجرا (به‌خاطر `fetch` سراسری).
- سرویس `app` بالا و در دسترس باشد.
- اگر پشت **Caddy** هستید، دامنهٔ عمومی را بدهید؛ وگرنه مستقیم به خود اپ وصل شوید.

> نکته: می‌توانید اسکریپت را از داخل کانتینر هم اجرا کنید (`docker compose exec app node scripts/phase5/smoke-test.mjs`)
> چون Node در ایمیج اپ موجود است؛ در این حالت مقصد پیش‌فرض `http://127.0.0.1:8080` است.

---

## ۲) اجرا

### الف) مستقیم روی سرور، از ریشهٔ مخزن

```bash
# حالت پیش‌فرض: http://127.0.0.1:8080
node afagh-next/scripts/phase5/smoke-test.mjs

# با آدرس دلخواه (پشت Caddy)
SMOKE_BASE_URL=https://afagh.example.ir node afagh-next/scripts/phase5/smoke-test.mjs

# یا آدرس را به‌عنوان آرگومان بدهید
node afagh-next/scripts/phase5/smoke-test.mjs https://afagh.example.ir
```

### ب) از داخل کانتینر اپ

```bash
docker compose exec app node scripts/phase5/smoke-test.mjs
# پشت پروکسی در همان شبکه:
docker compose exec -e SMOKE_BASE_URL=http://app:8080 app node scripts/phase5/smoke-test.mjs
```

---

## ۳) متغیرهای محیطی

| متغیر | پیش‌فرض | کاربرد |
|---|---|---|
| `SMOKE_BASE_URL` | `http://127.0.0.1:8080` | نشانی پایهٔ سرویس (یا آرگومان اول خط فرمان) |
| `SMOKE_TIMEOUT_MS` | `10000` | مهلت هر درخواست به میلی‌ثانیه |
| `SMOKE_BEHIND_PROXY` | — | `=1` اگر پشت Caddy/پروکسی هستید (پیام هدرهای لبه دقیق‌تر می‌شود) |

نمونهٔ کامل:

```bash
SMOKE_BASE_URL=https://afagh.example.ir \
SMOKE_TIMEOUT_MS=15000 \
SMOKE_BEHIND_PROXY=1 \
node afagh-next/scripts/phase5/smoke-test.mjs
```

---

## ۴) چه چیزهایی بررسی می‌شود؟

| # | بررسی | معیار قبولی |
|---|---|---|
| ۱ | `GET /login` | کد **۲۰۰** + وجود فرم ورود (فیلدهای `code`/`password`) |
| ۲ | `GET /api/health` | کد **۲۰۰** + بدنهٔ سالم DB (`ok:true` یا `status:"ok"`) |
| ۳ | `GET /verify-certificate` (یا جایگزین `GET /verify`) | کد **۲۰۰** |
| ۴ | یک مسیر ناشناسِ تصادفی | کد **۴۰۴** |
| ۵ | هدرهای امنیتی روی `/` | `X-Content-Type-Options: nosniff` + حداقل یکی از `Content-Security-Policy`/`Referrer-Policy`؛ همچنین `Strict-Transport-Security` (روی HTTPS)، `X-Frame-Options` و نبودِ `X-Powered-By` |

خروجی برای هر بررسی یکی از این برچسب‌ها را نشان می‌دهد:

- **[PASS]** — درست است.
- **[WARN]** — مشکل بحرانی نیست (مثلاً HSTS روی HTTP، یا هدر لبه‌ای که Caddy اضافه می‌کند). **باعث شکست نمی‌شود.**
- **[FAIL]** — خرابی واقعی؛ اسکریپت با **کد خروج غیرصفر** پایان می‌یابد.

نمونهٔ خروجی سالم:

```
🔎 اسموک‌تست افق — پایه: https://afagh.example.ir

[PASS] GET /login — 200، فرم ورود یافت شد (143ms)
[PASS] GET /api/health — 200، {"status":"ok","db":"ok"} (21ms)
[PASS] GET /verify-certificate — 200 (88ms)
[PASS] مسیر ناشناس ⇒ 404 — /__smoke_unknown_... (17ms)
[PASS] هدر X-Content-Type-Options — nosniff
[PASS] هدر CSP/Referrer-Policy — CSP✓ Referrer✓
[PASS] هدر Strict-Transport-Security — max-age=31536000; includeSubDomains
[PASS] هدر X-Frame-Options — SAMEORIGIN
[PASS] عدم افشای X-Powered-By — غایب است

✅ همهٔ بررسی‌ها موفق بودند — استقرار سالم به‌نظر می‌رسد.
```

---

## ۵) کد خروج و استفاده در CI/اسکریپت استقرار

| کد | معنا |
|---|---|
| `0` | همه‌چیز PASS (هشدار مجاز است) |
| `1` | حداقل یک FAIL |
| `2` | خطای خودِ اجرا (آدرس نامعتبر، خطای شبکهٔ پیش‌بین‌نشده) |

چون کد خروج معنادار است، می‌توانید آن را در انتهای اسکریپت استقرار بگذارید و در صورت شکست
استقرار را «ناموفق» علامت بزنید:

```bash
node afagh-next/scripts/phase5/smoke-test.mjs
if [ $? -ne 0 ]; then
  echo "✗ اسموک‌تست شکست خورد — به INCIDENT-RESPONSE-RUNBOOK.md مراجعه کنید."
  exit 1
fi
```

---

## ۶) رفع‌سریع خطاهای رایج

| نشانه | علت احتمالی | اقدام |
|---|---|---|
| `timeout > 10000ms` روی همه | اپ بالا نیامده یا شبکه بسته است | `docker compose ps` و `docker compose logs app` را ببینید |
| `/login` کد ۲۰۰ ولی فرم نیست | بیلد ناقص/کش قدیمی | ایمیج را دوباره بسازید و `app` را ری‌استارت کنید |
| `/api/health` کد ۵۰۳ | قطعِ اتصال DB | لاگ `app` و وضعیت `db` را بررسی کنید؛ به runbook مراجعه کنید |
| مسیر ناشناس ۲۰۰ (نه ۴۰۴) | پروکسی بیرونی مسیرها را به اپ نمی‌فرستد | تنظیمات Caddy/reverse_proxy را بازبینی کنید |
| `Strict-Transport-Security` غایب روی HTTPS | هدر لبه تنظیم نشده | بلوک `header` در `caddy/Caddyfile` و `next.config.mjs` را بررسی کنید |
| همه HTTP ۳xx | ریدایرکت HTTP→HTTPS | مستقیم به نشانی نهایی `https://…` تست کنید |

---

## ۷) جایگاه در روند استقرار

1. `docker compose up -d --build` (یا روش استقرار شما).
2. انتظار تا سالم‌شدن کانتینت‌ها (`docker compose ps`).
3. **اجرای همین اسموک‌تست.**
4. اگر PASS شد → اعلام موفقیت استقرار و ادامهٔ پایش.
5. اگر FAIL شد → طبق `INCIDENT-RESPONSE-RUNBOOK.md` عمل کنید (گزینهٔ بازگشت/rollback).

> این اسموک‌تست جایگزین **بررسی امنیتی کامل** (`DEPLOY-SECURITY-CHECKLIST.md`) نیست؛
> فقط یک «نبض‌سنجی» سریع و تکرارپذیر است که مطمئن می‌شود سرویس زنده و پاسخ‌گو است.

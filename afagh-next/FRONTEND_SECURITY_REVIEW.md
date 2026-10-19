# بررسی امنیت فرانت‌اند — Afagh ERP (afagh-next)

تاریخ: ۱۴۰۵/۰۷/۲۷ (۲۰۲۶-۱۰-۱۹)  
دامنهٔ بررسی: `next.config.mjs`, `caddy/Caddyfile`, `src/components`, `src/app`, کوکی‌ها و باندل کلاینت.

---

## ۱) خلاصه

- **XSS مستقیم در React وجود ندارد**: همهٔ رشته‌های کاربری با JSX رندر می‌شوند (escape خودکار). تنها `dangerouslySetInnerHTML`ها برای **SVG تولیدشدهٔ سمت سرور** (QR) استفاده می‌شوند و ورودی آن‌ها کنترل‌شده است.
- **CSP در لبه (Caddy) مناسب و کامل است** اما به `script-src 'unsafe-inline'` نیاز دارد (به‌دلیل inline bootstrap/hydration Next.js). `object-src 'none'`، `base-uri 'self'`، `frame-ancestors 'self'` فعال‌اند.
- **کلیک‌جکینگ** در Caddy با `X-Frame-Options: SAMEORIGIN` و `frame-ancestors 'self'` کنترل شده است. `next.config.mjs` عمداً frame policy ندارد (یکپارچگی iframe) — باید در لبه حفظ شود.
- **کوکی نشست** `httpOnly`، `Secure` (بر اساس env)، `SameSite` دارد و host-only است. چند کوکی محدوده (term) بدون `httpOnly`/`Secure` بودند — اصلاح شد.
- **دادهٔ حساس در باندل/LocalStorage** یافت نشد (تنها `theme` در localStorage). هیچ `NEXT_PUBLIC_` حاوی راز وجود ندارد.

---

## ۲) CSP

| محل | وضعیت |
|---|---|
| `caddy/Caddyfile` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'` |
| `next.config.mjs` | حداقلی: `object-src 'none'; base-uri 'self'` (فقط به‌عنوان fallback مستقیم) |

**یافته‌ها:**
- `unsafe-inline` در `script-src`/`style-src` به‌دلیل Next.js 16 App Router اجتناب‌ناپذیر است تا زمان پیاده‌سازی CSP مبتنی بر nonce. تا آن زمان ریسک XSS به‌واسطهٔ قفل‌بودن `connect-src`/`default-src` روی `'self'` و `object-src 'none'` محدود می‌ماند.
- `img-src data: blob:` برای QR (SVG/PNG) و تصاویر بارگذاری‌شده لازم است. `data:` می‌تواند برای تزریق HTML در سناریوی XSS سوءاستفاده شود، اما به‌تنهایی اجرا نمی‌شود و با `default-src 'self'` محدود است.

**توصیه (فاز بعد):** پیاده‌سازی CSP مبتنی بر nonce با middleware/proxy و `strict-dynamic`؛ حذف `unsafe-inline` از `script-src`.

---

## ۳) XSS

| الگو | تعداد | ارزیابی |
|---|---|---|
| `dangerouslySetInnerHTML` | ۷ (QR) | ✅ خروجی `qrcode` (server-only)، ورودی کنترل‌شده |
| `innerHTML` مستقیم | ۰ در next | — |
| `eval`/`new Function` | ۰ (فقط `redis.eval` سمت سرور) | — |
| `href`/`src` پویا | بسیار | ✅ لینک‌ها با `isSafeLinkUrl` فیلتر می‌شوند؛ تصاویر admin-controlled |

**نکات:**
- `src/app/login/ShowcaseSlider.tsx` از `isSafeLinkUrl` برای `linkUrl` استفاده می‌کند؛ `imageUrl` به‌صورت `<img src>` رندر می‌شود (اجرای JS ندارد).
- `src/lib/safe-url.ts` لینک‌های `javascript:`، `data:`، `//host` و کاراکترهای کنترلی را رد می‌کند.
- کوکی `gm_dept` از `id` عددی ساخته می‌شود (بدون تزریق).

---

## ۴) کلیک‌جکینگ

- Caddy: `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'`.
- Next: عمداً ندارد (به‌دلیل یکپارچگی iframe در «دامنهٔ واسط»). اگر دسترسی مستقیم به Next (بدون Caddy) فعال شود، هدرهای لبه اعمال نمی‌شوند → توصیه می‌شود همان policy در `next.config.mjs` نیز mirror شود (فاز بعد، پس از تأیید یکپارچگی iframe).

---

## ۵) کوکی‌ها (کلاینت)

| کوکی | httpOnly | Secure | SameSite | وضعیت |
|---|---|---|---|---|
| `token` (نشست) | ✅ | ✅ (env) | ✅ | امن |
| `afagh_uni` | ✅ | ✅/⚠ | lax | route handler امن؛ `university-actions` پیش‌فرض `secure=true` (حتی dev) — ناهماهنگی کوچک |
| `afagh_term` | ⚠→✅ | ⚠→✅ | lax | **اصلاح شد** |
| `gm_dept` (client) | ❌ (JS) | ⚠→✅ (HTTPS) | lax | **اصلاح شد** |

**اصلاحات انجام‌شده:**
- `src/app/group-manager/DeptSwitcher.tsx`: افزودن `Secure` شرطی بر اساس `window.location.protocol === 'https:'`.
- `src/app/api/scope/term/route.ts`: افزودن `httpOnly` + `Secure` (بر اساس env/production).
- `src/lib/term-scope-actions.ts`: افزودن `httpOnly` + `Secure`.

---

## ۶) دادهٔ حساس در باندل/LocalStorage

- `localStorage`: فقط `theme` (`'dark'`/`'light'`).
- `NEXT_PUBLIC_*`: فقط `NEXT_PUBLIC_AFAGH_DEMO_LOCK` (پرچم build-time، بدون راز).
- هیچ توکن/کلید در کلاینت ذخیره نمی‌شود (توکن نشست `httpOnly`).

---

## ۷) توصیه‌های آینده (اولویت)

1. CSP مبتنی بر nonce + حذف `unsafe-inline`.
2. Mirror کردن `X-Frame-Options`/`frame-ancestors` در `next.config.mjs` پس از تأیید یکپارچگی iframe.
3. یکسان‌سازی پیش‌فرض `Secure` در `university-actions.ts` با route handler (production default).
4. اعتبارسنجی `imageUrl` در `login-showcase` (مانند `isSafeLinkUrl`) برای جلوگیری از `javascript:` در `src` (خطر پایین، img src اجرا نمی‌شود).
5. افزودن `__Host-` prefix برای کوکی نشست در فاز بعد با مسیر مهاجرت (مستند در `auth.ts`).

---

## ۸) فایل‌های تغییریافته (این بررسی)

- `src/app/group-manager/DeptSwitcher.tsx`
- `src/app/api/scope/term/route.ts`
- `src/lib/term-scope-actions.ts`

بدون build/test/commit. `git diff --check` باید پاک باشد.

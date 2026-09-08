# مرز اعتماد پروکسی

## مدل اعتماد
Next headers آدرس واقعی اتصال TCP را در اختیار این کد نمی‌گذارد؛ بنابراین هیچ X-Forwarded-For، X-Real-IP یا Host ورودی به‌تنهایی مبنای اعتماد نیست.

Caddy مستقیمِ لبه، دو هدر را **جایگزین** می‌کند:
- X-Afagh-Client-IP: آدرس اتصال ورودی به Caddy، نه نخستین IP ادعایی در یک زنجیره.
- X-Afagh-Proxy-Token: راز مشترک سرویس اپ و Caddy.

اپ فقط وقتی AFAGH_TRUST_PROXY دقیقاً true است، راز حداقل ۳۲ کاراکتر دارد و توکن با مقایسهٔ زمان‌ثابت مطابقت می‌کند، یک IP معتبر را می‌پذیرد. IPv6 استاندارد می‌شود و IPv4-mapped IPv6 به IPv4 تبدیل می‌شود. لیست، پورت و zone identifier پذیرفته نمی‌شوند.

راز مشترک به‌تنهایی جای محدودیت شبکه نیست. لایهٔ HTTPS تمام published portهای اپ را با `ports: !reset []` حذف می‌کند. Caddy از شبکهٔ داخلی Docker به app:8080 وصل می‌شود. سرقت راز یا دسترسی مدیریتی به Docker خارج از تضمین این کنترل است؛ راز را در لاگ، خروجی عمومی docker compose config یا متغیر NEXT_PUBLIC منتشر نکنید.

## فعال‌سازی HTTPS
نیازمند Docker Compose نسخهٔ 2.24.4 یا جدیدتر.

1. خروجی `openssl rand -hex 32` را در فایل خصوصی `.env` به‌عنوان AFAGH_PROXY_SECRET قرار دهید.
2. متغیرهای زیر را تنظیم کنید:

```dotenv
DOMAIN=edu.example.ac.ir
AFAGH_PUBLIC_BASE_URL=https://edu.example.ac.ir
AFAGH_PROXY_SECRET=<خروجی تصادفی دستور بالا؛ نه این متن نمونه>
```

3. پیکربندی را بررسی و سپس در پنجرهٔ استقرار خود اجرا کنید:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

لایهٔ HTTPS، AFAGH_TRUST_PROXY و AFAGH_COOKIE_SECURE را true می‌کند. با حذف خودکار port mapping، مقدار APP_PORT نمی‌تواند listener مستقیم اپ را دوباره باز کند. پورت‌های ۸۰ و ۴۴۳ متعلق به Caddy هستند. API مدیریت Caddy (پورت ۲۰۱۹) را منتشر نکنید.

## اجرای مستقیم / توسعه
اعتماد به پروکسی به‌صورت پیش‌فرض false است. در اجرای مستقیم، IP نامطمئن null است و کلید محدودسازی از مقدار ثابت unknown استفاده می‌کند. نتیجه: کلاینت‌های فاقد هویت قابل‌اعتماد سهمیهٔ مشترک دارند؛ این انتخاب محافظه‌کارانه است، نه تشخیص IP واقعی.

Compose پایه همچنان مسیر HTTP مستقیم قبلی را حفظ می‌کند؛ حذف پورت فقط در ترکیب HTTPS تضمین شده است. اگر اپ را دستی پشت Nginx یا پراکسی دیگری اجرا می‌کنید، باید معادل همین بازنویسی هدر، راز مشترک و محدودیت شبکه را پیاده کنید؛ صرفاً true کردن TRUST_PROXY کافی نیست.

اگر Caddy پشت CDN/Load Balancer باشد، IP مشاهده‌شده متعلق به همان واسط است. برای حفظ امنیت، اعتماد به زنجیرهٔ CDN در این بسته فعال نشده است. آن استقرار نیاز به allowlist و طراحی مجزای trust دارد؛ نخستین X-Forwarded-For را کپی نکنید.

## کوکی
گزینهٔ auto از AFAGH_PUBLIC_BASE_URL استفاده می‌کند؛ هیچ Host یا هدر forwarded در تشخیص HTTPS دخیل نیست. در production با URL غایب/نامعتبر، Secure پیش‌فرض فعال است. HTTP صریح و overrideهای اپراتور برای توسعه حفظ شده‌اند. در Compose HTTPS، Secure صریحاً true است. حالت SameSite فعلی حفظ شده؛ بازبینی CSRF جزو این تغییر نیست.

## تست
از afagh-next:

```bash
npm test
npm run typecheck
npm run build
npm run test:proxy-integration  # نیازمند نصب caddy روی PATH
```

تست یکپارچه، Caddy واقعی را با تنظیمات header_up فایل مخزن و یک backend آزمایشی اجرا می‌کند؛ HTTPS/گواهی، مرورگر و نشست واقعی را آزمایش نمی‌کند. پروسه‌ها و فایل‌های موقت پس از تست پاک می‌شوند.

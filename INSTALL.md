# 📦 پکیج نصب کامل — سامانه جامع دانشگاه آفاق

یک پکیج، دو نسل سیستم:

| | مسیر | پشته | پورت |
|---|---|---|---|
| **کالبد مدرن** | `afagh-next/` | Next.js 16 + PostgreSQL + Drizzle + Redis + MinIO | ۳۱۰۰ |
| **فاز صفر (دمو کامل)** | `afagh-erp/` | Node خالص + SQLite — ۱۲ ماژول E2E | ۳۰۰۰ (اختیاری) |

## نصب سریع (سه دستور)

```bash
tar xzf afagh-v1.0.0.tar.gz && cd afagh
./install.sh          # همه‌چیز: نقش‌ها، ۷۳ جدول، RLS، دادهٔ دمو، Redis، بیلد
./start.sh            # MinIO + کالبد :3100  (فاز صفر: ./start.sh --with-demo)
```

> نصب Docker-ای سرویس‌های زیرین: `AFAGH_USE_DOCKER=1 ./install.sh`
> (PostgreSQL + Redis + MinIO با `docker compose` بالا می‌آیند)

## پیش‌نیازها

- **Node.js ≥ ۱۸** و npm
- **PostgreSQL** (۱۴+) و **Redis** — محلی یا docker
- MinIO لازم نیست نصب کنید؛ `start.sh` در صورت نبود، خودش دانلود و اجرا می‌کند
- لینوکس (تست‌شده روی Debian/Ubuntu). `sudo` برای ساخت نقش/دیتابیس اولیه

## install.sh دقیقاً چه می‌کند؟ (idempotent — دوباره اجرا هم بی‌خطر است)

1. **بررسی پیش‌نیازها** و سلامت PostgreSQL/Redis
2. **PostgreSQL**: نقش `afagh` + دیتابیس `afagh_db` (در صورت نبود)
3. **npm install** هر دو پروژه
4. **Drizzle push** → ۷۳ جدول/۵۱۰ ستون + **pg-hardening.sql** → ایندکس‌ها، **RLS با ۱۱ سیاست** و نقش فقط-خواندنی `afagh_app`
5. **مهاجرت دمو**: دیتای فاز صفر (SQLite داخل پکیج) → PostgreSQL (ON CONFLICT → بی‌خطر)
6. **گرم‌کردن Redis** (ظرفیت کلاس‌ها §۱۰۰۶) + **بیلد پروداکشن Next.js**

## حساب‌های دمو (رمز همه: `123456`)

| نقش | کد ملی | مقصد |
|---|---|---|
| مدیر | 0000000001 | /admin — کارتابل + حقوق + **بایگانی مدارک** |
| استاد (رضایی) | 0011111111 | /professor — کلاس‌ها + فیش + **امضای الکترونیک** (سند ۳ = در انتظار امضا) |
| دانشجو (علی) | 31412001* | /student — کارنامه + انتخاب واحد + مدارک من |
| کارشناس بایگانی | 0099999999 | فاز صفر :3000 — کارتابل e-KYC |

\* شمارهٔ دانشجویی — ورود با کد ملی از دیتای seed.

## مدیریت

```bash
./status.sh            # سلامت زندهٔ ۵ سرویس + آمار Redis/PG
./stop.sh              # توقف سرویس‌های اجراشده توسط start.sh
./start.sh --with-demo # با فاز صفر روی ۳۰۰۰
```

## عیب‌یابی

| مشکل | راه‌حل |
|---|---|
| «PostgreSQL رو نیست» | `service postgresql start` یا `AFAGH_USE_DOCKER=1` |
| دسترسی sudo برای PG نیست | دو دستور CREATE ROLE/createdb که installer چاپ می‌کند را دستی بزنید و دوباره اجرا کنید |
| MinIO بالا نیامد | `run/logs/minio.log` — یا `docker run -p 9000:9000 minio/minio server /data` |
| ریست دموی فاز صفر | `cd afagh-erp && npm run reset` |
| دیتای دمو در PG نمی‌آید | `cd afagh-next && node scripts/migrate-sqlite-to-pg.mjs` |

## امنیت در نصب واقعی

- رمزهای پیش‌فرض (`afagh`/`afagh`، `afagh_app`/`afagh_app`، MinIO `afagh-secret`) فقط برای توسعه‌اند — در استقرار واقعی عوض کنید: `.env`، `pg-hardening.sql`، `docker-compose.yml`
- RLS فعال است: نقش `afagh_app` حتی با بایپس کد، ردیف دانشجوی دیگر را نمی‌بیند/نمی‌نویسد (§۲۱۷۰)
- فایل‌های مدارک در MinIO خارج از دیتابیس؛ دسترسی با لینک امضاشدهٔ ۵ دقیقه‌ای (§۲۴۳۸)

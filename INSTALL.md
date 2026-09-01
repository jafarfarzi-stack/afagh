# 📦 پکیج نصب کامل — سامانه جامع دانشگاه آفاق

یک پکیج، دو نسل سیستم:

| | مسیر | پشته | پورت |
|---|---|---|---|
| **کالبد مدرن** | `afagh-next/` | Next.js 14 + PostgreSQL + Drizzle + Redis + MinIO | ۸۰۸۰ |
| **فاز صفر (دمو کامل)** | `afagh-erp/` | Node خالص + SQLite — ۱۲ ماژول E2E | ۳۰۰۰ (اختیاری) |

## 🚀 استقرار پروداکشن روی Debian 13 — همه‌چیز داخل Docker

سرور تازه‌نصب Debian 13 (Trixie) با دسترسی root. یک دستور، و سامانه روی **پورت ۸۰۸۰** بالا می‌آید:

```bash
git clone -b arena/01a05c13-afagh https://github.com/jafarfarzi-stack/afagh.git
cd afagh
sudo ./deploy-debian.sh
```

اسکریپت این کارها را می‌کند:

1. تشخیص نسخهٔ Debian و نصب **Docker Engine + Compose plugin** از مخزن رسمی داکر (اگر نصب نباشد)
2. ساخت فایل `.env` با **رمزهای تصادفی** برای PostgreSQL و MinIO (`chmod 600`)
3. بیلد ایمیج Next.js (خروجی `standalone`، کاربر غیر-root داخل کانتینر)
4. بالا آوردن `postgres` + `redis` + `minio` + `app` با `docker compose`
5. اجرای خودکار سرویس **migrator**: ساخت جدول‌ها (`drizzle-kit push`) + ایندکس‌ها و RLS
6. بررسی سلامت: `pg_isready`، `redis-cli ping` و `HTTP 200` روی `/login`
7. باز کردن پورت ۸۰۸۰ در `ufw` (اگر فعال باشد)

| سوییچ | کار |
|---|---|
| `--port 9090` | لیسن روی پورت دیگر به‌جای ۸۰۸۰ |
| `--update` | `git pull` + بیلد مجدد + ری‌استارت (به‌روزرسانی نسخه) |
| `--fresh` | حذف کانتینرها و **کل داده** و استقرار از صفر |
| `--no-build` | فقط اجرا، بدون بیلد مجدد |
| `--with-demo-data` | انتقال دادهٔ نمونهٔ فاز صفر به PostgreSQL |
| `--skip-docker-install` | داکر از قبل نصب است |

**معماری استقرار:**

| سرویس | ایمیج | دسترسی |
|---|---|---|
| `app` (Next.js standalone) | از روی `afagh-next/Dockerfile` | **`0.0.0.0:8080`** — عمومی |
| `postgres` | `postgres:16-alpine` | فقط `127.0.0.1:5432` |
| `redis` | `redis:7-alpine` | فقط `127.0.0.1:6379` |
| `minio` | `minio/minio` | فقط `127.0.0.1:9000` و کنسول `9001` |

دیتابیس، Redis و MinIO **از بیرون سرور در دسترس نیستند**؛ فقط اپ روی ۸۰۸۰ باز است.
دادهٔ ماندگار در volumeهای داکر: `afagh_pg`، `afagh_redis`، `afagh_minio`.

**مدیریت روزمره:**

```bash
docker compose -p afagh -f docker-compose.prod.yml ps          # وضعیت
docker compose -p afagh -f docker-compose.prod.yml logs -f app # لاگ زنده
docker compose -p afagh -f docker-compose.prod.yml restart app # ری‌استارت
sudo ./deploy-debian.sh --update                               # به‌روزرسانی نسخه
docker exec afagh_pg pg_dump -U afagh afagh_db > backup-$(date +%F).sql   # پشتیبان
```

> پشت **Nginx/Caddy** با HTTPS: ترافیک را به `127.0.0.1:8080` پروکسی کنید و در `.env`
> مقدار `APP_PORT=127.0.0.1:8080` بگذارید تا پورت مستقیم از اینترنت بسته شود.

---

## 🐳 نصب با Docker — روش پیشنهادی (ویندوز / لینوکس / مک)

دیتابیس و سرویس‌های زیرین **کاملاً روی Docker** نصب می‌شوند؛ هیچ PostgreSQL/Redis/MinIO محلی لازم نیست.

**ویندوز (PowerShell، در ریشهٔ پروژه):**

```powershell
powershell -ExecutionPolicy Bypass -File .\install-docker.ps1 -WithDemoData
cd afagh-next ; npm start          # → http://localhost:8080
```

**لینوکس / مک:**

```bash
./install-docker.sh --with-demo-data
cd afagh-next && npm start         # → http://localhost:8080
```

| سوییچ (ویندوز / لینوکس) | کار |
|---|---|
| `-WithDemoData` / `--with-demo-data` | ساخت دادهٔ نمونهٔ فاز صفر و انتقالش به PostgreSQL |
| `-Fresh` / `--fresh` | حذف کانتینرها و **کل داده**، نصب از صفر |
| `-SkipBuild` / `--skip-build` | بدون بیلد پروداکشن (برای `npm run dev`) |
| `-Start` / `--start` | بعد از نصب، سرور را هم اجرا کن |

اسکریپت این کارها را انجام می‌دهد (چند بار اجرا کردنش بی‌خطر است):

1. بررسی Node ≥ ۱۸، Docker در حال اجرا، و پورت‌های اشغال
2. بالا آوردن **PostgreSQL 16 + Redis 7 + MinIO** با `docker compose` (پروژهٔ `afagh`) و صبر تا `pg_isready`
3. ساخت `afagh-next/.env` از روی `.env.example` (اگر نبود)
4. `npm install` هوشمند (فقط وقتی `package-lock.json` عوض شده باشد)
5. `drizzle-kit push` → همهٔ جدول‌ها + `npm run db:hardening` → ایندکس‌ها، RLS و نقش `afagh_app`
6. دادهٔ دمو (اختیاری) + گرم‌کردن ظرفیت کلاس‌ها در Redis
7. `npm run build`

**مدیریت سرویس‌ها:**

```powershell
docker compose -p afagh-dev -f afagh-next\docker-compose.yml ps     # وضعیت
.\stop-docker.ps1                                               # خاموش (داده حفظ می‌شود)
.\stop-docker.ps1 -RemoveData                                   # حذف کامل داده
```

> ⚠️ اگر پورت ۵۴۳۲ روی سیستم شما با PostgreSQL محلی اشغال است، یا آن را متوقف کنید یا در
> `afagh-next/docker-compose.yml` مقدار `ports` را به `'5433:5432'` تغییر داده و `DATABASE_URL`
> را در `.env` هماهنگ کنید.

---

## نصب سنتی روی لینوکس (سرویس‌های محلی)

```bash
tar xzf afagh-v1.0.0.tar.gz && cd afagh
./install.sh          # همه‌چیز: نقش‌ها، ۷۳ جدول، RLS، دادهٔ دمو، Redis، بیلد
./start.sh            # MinIO + کالبد :8080  (فاز صفر: ./start.sh --with-demo)
```

> نصب Docker-ای سرویس‌های زیرین: `AFAGH_USE_DOCKER=1 ./install.sh`
> (PostgreSQL + Redis + MinIO با `docker compose` بالا می‌آیند)

## پیش‌نیازها

**روش Docker (پیشنهادی):** فقط **Node.js ≥ ۱۸** و **Docker Desktop / Docker Engine**. تمام.

**روش سنتی:**
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
| `docker: command not found` یا «Docker اجرا نمی‌شود» | Docker Desktop را باز کنید و صبر کنید وضعیتش **Running** شود |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | PostgreSQL محلی را متوقف کنید یا در `docker-compose.yml` پورت را `'5433:5432'` کنید و `DATABASE_URL` را در `.env` هماهنگ کنید |
| در ویندوز اسکریپت اجرا نمی‌شود (`running scripts is disabled`) | `powershell -ExecutionPolicy Bypass -File .\install-docker.ps1` |
| `ECONNREFUSED 127.0.0.1:5432` هنگام `db:push` | کانتینر بالا نیست: `docker compose -p afagh-dev -f afagh-next/docker-compose.yml ps` |
| بیلد بعد از `git pull` خطا می‌دهد | `node_modules` و `.next` را پاک و دوباره `npm install` (نسخهٔ Next تغییر کرده) |
| «PostgreSQL رو نیست» | `service postgresql start` یا `AFAGH_USE_DOCKER=1` |
| دسترسی sudo برای PG نیست | دو دستور CREATE ROLE/createdb که installer چاپ می‌کند را دستی بزنید و دوباره اجرا کنید |
| MinIO بالا نیامد | `run/logs/minio.log` — یا `docker run -p 9000:9000 minio/minio server /data` |
| ریست دموی فاز صفر | `cd afagh-erp && npm run reset` |
| دیتای دمو در PG نمی‌آید | `cd afagh-next && node scripts/migrate-sqlite-to-pg.mjs` |

## امنیت در نصب واقعی

- رمزهای پیش‌فرض (`afagh`/`afagh`، `afagh_app`/`afagh_app`، MinIO `afagh-secret`) فقط برای توسعه‌اند — در استقرار واقعی عوض کنید: `.env`، `pg-hardening.sql`، `docker-compose.yml`
- RLS فعال است: نقش `afagh_app` حتی با بایپس کد، ردیف دانشجوی دیگر را نمی‌بیند/نمی‌نویسد (§۲۱۷۰)
- فایل‌های مدارک در MinIO خارج از دیتابیس؛ دسترسی با لینک امضاشدهٔ ۵ دقیقه‌ای (§۲۴۳۸)

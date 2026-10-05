# آفاق (Afagh) — سامانه جامع مدیریت دانشگاه

بازسازی کامل سامانه‌ی آفاق ERP بر پایه **Next.js 14 App Router + PostgreSQL 16 + Drizzle ORM + Redis** — با وفاداری کامل به معماری فاز صفر (Express/SQLite) و مهاجرتی ۱:۱ داده‌ها.

---

## ✨ ویژگی‌های کلیدی

| قابلیت | توضیح |
|----------|--------|
| **سه داشبورد ایزوله** | پنل‌های مجزا برای **دانشجو** (`/student`)، **استاد** (`/professor`)، **ادمین** (`/admin`) با مسیریابی و احراز هویت مستقل |
| **موتور انتخاب واحد زنده** | سبد ۱۵ دقیقه‌ای، اتاق انتظار Redis (Lua atomic check، صف FIFO، ارتقای خودکار، سپر نرخ) |
| **فیلتر پیش‌نیاز/هم‌نیاز** | درخت منطقی AND/OR، minGrade، قاعده سیلابسی، نمرهٔ قبولی مؤثر، تداخل امتحانی، ارجاع کمیسیون |
| **امضای الکترونیک** | گردش کار سه‌وضعیتی IDLE → OTP_SENT → SIGNED، OTP ۵ رقمی، انقضای ۲ دقیقه، قفل ۵ تلاش، ممیزی زنجیره‌ای |
| **هوش تجاری ارزشیابی (BI)** | داشبورد کیفیت تدریس اساتید، تحلیل امکانات کلاس‌ها، کش پیش‌محاسبه، بازسازی دستی/زمان‌بندی |
| **بایگانی الکترونیک (Object Storage)** | MinIO (S3-compatible)، پنل ادمین آپلود/تأیید/رد، سلف‌آپلود e-KYC دانشجو، لینک امضاشده ۵ دقیقه‌ای |
| **RLS سخت (Row Level Security)** | ۱۱ سیاست روی ۴ جدول، نقش `afagh_app`، جدایی کامل داده‌های دانشجو در سطح دیتابیس |
| **کارنامه رسمی سما** | محاسبه معدل با سیاست‌های آیین‌نامه (حذف مردودی، جبرانی، تبصره ۱۳۹۱، مشروطی واحد)، خروجی چاپ WYSIWYG |
| **مهاجرت داده SQLite→PostgreSQL** | اسکریپت موازی برای ۷۳ جدول / ۵۱۰ ستون، نگاشت هش scrypt، ریست serial، اعتبارسنجی integrity |

---

## 🏗 معماری و ساختار پروژه

```
afagh-next/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/              # پنل مدیریت (کارتابل، نمرات، کارنامه، پذیرش، برنامه‌ریزی، مالی، بایگانی، ...)
│   │   ├── professor/          # پنل استاد (کلاس‌ها، نمرات، فیش حقوق، اسناد، کارنامه KPI)
│   │   ├── student/            # پنل دانشجو (انتخاب واحد، کارنامه، مدرک، درخواست‌ها، تقویم امتحان)
│   │   ├── api/                # API Routes (Enrollment, Archive, Cron jobs, ...)
│   │   ├── globals.css         # استایل‌های سراسری + پرینت کارنامه
│   │   └── layout.tsx          # Root layout + providers
│   ├── components/             # کامپوننت‌های مشترک (DataTable, ElectronicSignature, Modals, ...)
│   ├── db/
│   │   ├── index.ts            # اتصال Drizzle + RLS helper (withUserRls)
│   │   ├── schema.ts           # ۷۳ جدول Drizzle (کالبد ۱:۱ از schema.sql فاز صفر)
│   │   └── pg-hardening.sql    # ایندکس‌ها، پارتیشن، RLS، آرشیو، VACUUM
│   ├── lib/
│   │   ├── auth.ts             # scrypt + salt، نشست ۲ روزه، requireRole، getCurrentUniversity
│   │   ├── enroll-engine.ts    # موتور انتخاب واحد (پیش‌نیاز، تداخل، ظرفیت، انتظار)
│   │   ├── waitingRoom.ts      # اتاق انتظار Redis (Lua، صف، ارتقا)
│   │   ├── regulations-engine.ts  # موتور آیین‌نامه (معدل، مشروطی، جبرانی، تبصره ۱۳۹۱)
│   │   ├── bi-engine.ts        # هوش تجاری ارزشیابی (استات‌های اساتید/کلاس)
│   │   ├── scheduling-engine.ts    # موتور برنامه‌ریزی درسی (عرضه، تخصیص، اتاق)
│   │   ├── class-session-generator.ts  # تولید جلسات واقعی از schedules
│   │   ├── objectStore.ts      # MinIO client + helperهای آپلود/دانلود/امضا
│   │   ├── university-scope.ts # فیلتر چنددانشگاهی (currentUniversityId)
│   │   └── grade-status-codes.js  # میز تطبیق کدهای وضع نمره سما
│   └── scripts/                # اسکریپت‌های مهاجرتی و مدیریتی
├── tests/                      # Unit tests (Vitest/tsx)
│   ├── transcript-summary.test.ts     # تست هسته کارنامه
│   └── scheduling-planning-core.test.ts  # تست موتور برنامه‌ریزی
├── docker-compose.yml          # PostgreSQL 16 + MinIO + Redis
├── drizzle.config.ts           # تنظیمات Drizzle
├── next.config.mjs             # Next.js config (standalone output)
└── package.json
```

---

## 🚀 راه‌اندازی سریع

### پیش‌نیازها
- **Node.js 20+** (پیشنهاد: 20.18 LTS)
- **PostgreSQL 16** (یا `docker compose up -d postgres`)
- **Redis 7+** (برای اتاق انتظار، `docker compose up -d redis`)
- **MinIO** (برای Object Storage، `docker compose up -d minio`)

### نصب و اجرا

```bash
# 1. کلون و وابستگی‌ها
git clone <repo-url>
cd afagh-next
npm install

# 2. متغیرهای محیطی
cp .env.example .env
# ویرایش .env با مقادیر واقعی (DATABASE_URL، MINIO_*، REDIS_URL، JWT_SECRET، ...)

# 3. دیتابیس
npm run db:push               # ساخت ۷۳ جدول با Drizzle
npm run db:hardening          # اعمال ایندکس‌ها، پارتیشن، RLS (src/db/pg-hardening.sql)

# 4. (اختیاری) مهاجرت داده از فاز صفر SQLite
npm run db:migrate-sqlite     # مسیر پیش‌فرض: ../afagh-erp/data/afagh.db

# 5. سرویس‌های جانبی
bash scripts/start-minio.sh &    # MinIO روی ۹۰۰۰ (کنسول: ۹۰۰۰۱)
npm run warm:redis              # گرم‌کردن ظرفیت‌ها در Redis (یا دکمهٔ پنل ادمین)

# 6. اجرای توسعه
npm run dev                   # http://localhost:8080

# 7. پروداکشن
npm run build && npm start    # خروجی standalone در .next/standalone
```

### متغیرهای محیطی مهم (`.env`)

| متغیر | توضیح | پیش‌فرض |
|--------|--------|---------|
| `DATABASE_URL` | اتصال PostgreSQL | `postgresql://afagh:afagh@localhost:5432/afagh_db` |
| `REDIS_URL` | اتصال Redis | `redis://localhost:6379` |
| `MINIO_ENDPOINT` | آدرس MinIO | `localhost:9000` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | اعتبار MinIO | `minioadmin` / `minioadmin` |
| `MINIO_BUCKET` | نام باکت | `afagh-archive` |
| `JWT_SECRET` | کلید امضای توکن نشست | (الزامی، رشته تصادفی ۳۲ بایتی) |
| `NEXTAUTH_SECRET` | کلید NextAuth | (الزامی) |
| `APP_BASE_URL` | آدرس پایه اپلیکیشن | `http://localhost:8080` |

---

## 👥 حساب‌های دمو (پس‌از seed)

| نقش | کد ملی | رمز | مسیر ورود |
|------|--------|-----|-----------|
| **مدیر** | `0000000001` | `123456` | `/admin` — کارتابل گردش کار، نمرات، کارنامه، پذیرش، برنامه‌ریزی، مالی، بایگانی |
| **استاد** | `0011111111` | `123456` | `/professor` — کلاس‌ها، فیش حقوق، امضای اسناد، کارنامه KPI |
| **دانشجو** | `31412001*` | `123456` | `/student` — کارنامه، انتخاب واحد، درخواست‌ها، مدرک، تقویم امتحان |

> * شماره دانشجویی؛ ورود با کد ملی از جدول `users` (دیتای seed فاز صفر).

---

## 🧪 تست‌ها

```bash
# تست واحد هسته کارنامه (بدون React/DB)
npx -y tsx tests/transcript-summary.test.ts

# تست موتور برنامه‌ریزی درسی
npx -y tsx tests/scheduling-planning-core.test.ts

# بررسی TypeScript
npx tsc --noEmit
```

### پوشش تست هسته کارنامه (`transcript-summary.test.ts`)
- ✅ `numOrNull` / `regThresholds` / `passedCourseSet`
- ✅ `summarizeTerm` / `summarizeTotal` / `groupTranscript` (معدل نیمسال و کل + مشروطی)
- ✅ `breakdownByType` / `courseTypeGroup` (تفکیک جدول سما)
- ✅ `faNum` / `faWords` / `faIntWords` / `g2j` / `dateToJalali` / `todayJalali`
- ✅ `codeLabel` / `termDisplayTitle` / `thesisQualitativeLabel` / `thesisLegend`
- ✅ مقایسه الگوریتم جلالی ۳۳‌ساله با تقویم رسمی ICU (۷ سال، ۲۵۵۷ روز)
- ✅ کدهای منجمد (۵/۶/۷/۲۲) و حد نصاب قبولی مجدد (تبصره ۱۳۹۱)

---

## 📦 اسکریپت‌های مفید

| اسکریپت | توضیح |
|----------|--------|
| `npm run db:push` | Drizzle push (ساخت/به‌روزرسانی جداول) |
| `npm run db:hardening` | اجرای `pg-hardening.sql` (ایندکس، RLS، پارتیشن) |
| `npm run db:migrate-sqlite` | مهاجرت موازی SQLite → PostgreSQL |
| `npm run warm:redis` | انتقال ظرفیت‌ها به Redis (`scripts/warm-redis.mjs`) |
| `npm run lint` | ESLint + Prettier |
| `npx tsc --noEmit` | بررسی تایپ‌ها بدون emit |

---

## 🔐 مجوزها و نقش‌ها (RBAC)

ماتریس دسترسی در `src/lib/auth.ts` و میدل‌ور `src/middleware.ts`:

| نقش | کد | دسترسی‌های کلیدی |
|------|-----|-----------------|
| `ADMIN` | مدیر کل | دسترسی کامل به `/admin/*`، تنظیمات، بایگانی، کاربران |
| `EDU_EXPERT` | کارشناس آموزش | کارنامه، نمرات، پذیرش، برنامه‌ریزی، آیین‌نامه |
| `GRADUATEAFFAIRS` | فارغ‌التحصیلان | نمرات، کارنامه، گواهی، مجوز دفاع |
| `FINANCE_EXPERT` / `FINANCE` | کارشناس/مدیر مالی | تسویه حساب، بابت، طلب، فیش حقوق |
| `DEPT_HEAD` | مدیر گروه | برنامه‌ریزی درسی، ارزشیابی اساتید، پیش‌نیاز |
| `PROFESSOR` | استاد | کلاس‌ها، نمرات، فیش، اسناد، کارنامه KPI |
| `STUDENT` | دانشجو | انتخاب واحد، کارنامه، درخواست، مدرک، تقویم |

> **نکته**: احراز هویت بر پایه نشست HttpOnly (scrypt + salt، سازگار با فاز صفر). Middleware نقش را در Edge بررسی و redirect می‌کند.

---

## 📊 ماژول‌های اصلی

### ۱. پذیرش و سنجش (`/admin/admissions`)
- بارگذاری فایل TXT/CSV سازمان سنجش → `admissions_staging`
- نگاشت کد رشته/سهمیه (`sanjesh_mappings`)
- فرمول‌ساز پویای شماره دانشجویی (`student_id_formulas`)
- صدور شماره و پرونده دانشجویی (تراکنش اتمی)

### ۲. انتخاب واحد (`/student/enroll`)
- سبد ۱۵ دقیقه‌ای + تایمر زنده
- **فیلتر سخت**: پیش‌نیاز (درخت منطقی)، هم‌نیاز، تداخل امتحانی، سقف واحد، بدهی مالی، وضعیت تحصیلی
- **اتاق انتظار Redis**: چک اتمیک Lua، صف FIFO، ارتقای خودکار، سپر نرخ ۵ req/s
- لاگ کامل: `ENROLLMENT_SUBMITTED`، `ENROLLMENT_DONE`، `WAITLIST_PROMOTED`

### ۳. نمرات و کارنامه (`/admin/grades`، `/admin/students/transcript`)
- ثبت/ویرایش نمره ادمین/کارشناس (audit log کامل)
- محاسبه کد وضعیت سما هوشمند بر اساس آیین‌نامه
- **هسته کارنامه** (`transcript-utils.ts`): معدل نیمسال/کل، مشروطی (فایل + محاسبه)، حذف مردودی (EXCLUDE_IF_PASSED / EXCLUDE_IF_PASSED_1391)، جبرانی، تبصره ۱۳۹۱، تفکیک نوع درس (۶ ستون سما)
- چاپ رسمی WYSIWYG (۳ نیمسال کنار هم، سربرگ/پانوشت تکرار، صفحه دوم تفکیک)

### ۴. برنامه‌ریزی درسی (`/admin/scheduling`)
- **عرضه (Supply)**: گروه‌های درسی، اساتید، اتاق‌ها، تداخل‌ها
- **تقاضا (Demand)**: چارت درسی (`curriculum_versions`)، هم‌رشته‌ای‌ها، سقف واحد
- **تخصیص**: تخصیص اتاق، تدریس مشترک، تداخل سخت/نرم، تولید جلسات (`class-session-generator`)

### ۵. مالی و حقوق (`/admin/finance`، `/admin/payroll`)
- طلب/بابت/تسویه، چک/پرداخت، وام
- **موتور حقوق** (`payroll-engine.ts`): واحد تدریس، ضرایب (عملی/ارشد/جمعی)، کسر غیبت، مالیات، فیش شفاف

### ۶. بایگانی الکترونیک (`/admin/archive`، `/student/documents`)
- MinIO (S3-compatible) — فقط کلید در دیتابیس
- آپلود/تأیید/رد با دلیل + ممیزی زنجیره‌ای
- سلف‌آپلود e-KYC دانشجو (محدود به پرونده خود)
- لینک امضاشده ۵ دقیقه‌ای (AWS4 pre-signed URL)

### ۷. هوش تجاری ارزشیابی (`/admin/bi`)
- کیفیت تدریس اساتید (نمره، روند، پرچم، پاسخ‌دهندگان)
- امکانات کلاس‌ها (محورها، آستانه تعمیر، بدترین شاخص)
- کش پیش‌محاسبه (`analytics_snapshots`)، job شبانه `/api/cron/bi-refresh`

---

## 🗄 دیتابیس — نکات کلیدی

- **۷۳ جدول**، **۵۱۰ ستون** — نگاشت ۱:۱ از `schema.sql` فاز صفر
- نام ستون‌ها ** حفظ شده** (camelCase در Drizzle، snake_case در PG)
- **RLS**: ۱۱ سیاست روی `enrollments`، `enrollment_cart`، `enrollment_waitlist`، `student_documents`
- **پارتیشن**: `enrollments` بر اساس `termId`، `grade_change_log` بر اساس ماه
- **ایندکس‌های ترکیبی**: تمام کوئری‌های پراکندگی بالا پوشش داده شده
- **مهاجرت**: `scripts/migrate-sqlite-to-pg.mjs` — موازی، تراکنش‌محور، hash scrypt سازگار

---

## 📝 ساختار نام‌گذاری و قراردادها

| مورد | قرارداد |
|------|---------|
| **Server Actions** | در `actions.ts` کنار `page.tsx`، نام‌گذاری `*Action`، گارد `requireRole` |
| **Client Components** | hậu tố `Client.tsx`، `'use client'` در خط اول |
| **Types** | در `types.ts`، `export type` برای اشتراک Client/Server |
| **Utilities** | توابع خالص در `lib/` یا `*utils.ts`، قابل unit test |
- **Print Styles** | در `globals.css` با `@media print`، کلاس `.print-area`، `.transcript-print-area` |

---

## 🐛 عیب‌یابی رایج

| مشکل | راه‌حل |
|-------|--------|
| `tsc` خطا می‌دهد | `npx tsc --noEmit` برای جزئیات؛ معمولاً import گم شده یا type narrow |
| Redis connection refused | `docker compose up -d redis` و چک `REDIS_URL` |
| MinIO 403/404 | باکت وجود دارد؟ `MINIO_BUCKET` درست؟ کلیدها درست؟ |
| RLS صفر ردیف برمی‌گرداند | `set_config('app.user_id', ...)` در تراکنش ست شده؟ |
| مهاجرتی SQLite شکست | مسیر `.db` در `migrate-sqlite.mjs`، جداول خالی در PG؟ |
| چاپ کارنامه بهم‌ریخته | `@media print` در `globals.css`، margins، `break-inside: avoid` |

---

## 📚 مستندات ارجاع (سند معماری)

| بخش | شناسه سند |
|------|-----------|
| معماری کلی / D1–D4 | §۲۸۶۵، §۲۶۶۴ |
| انتخاب واحد / اتاق انتظار | §۱۰۰۶، §۱۰۱۴، §۱۰۱۶، §۱۰۱۸–۱۰۲۶، §۶۹۰۶ |
| پیش‌نیاز / هم‌نیاز | §۱۰۱۲ |
| امضای الکترونیک | §۲۹۲۶–۲۹۹۰ |
| RLS / امنیت سطح ردیف | §۲۱۷۰ |
| بایگانی / Object Storage | §۲۴۳۸، §۲۴۴۵ |
| سخت‌سازی PG | §۲۰۹۳–۲۲۲۹، §۲۱۷۰ |
| کارنامه / معدل / آیین‌نامه | §۲۲۴۳، `transcript-utils.ts` |
| برنامه‌ریزی درسی | `scheduling-engine.ts`، `class-session-generator.ts` |

---

## 🤝 مشارکت

1. Fork → Branch (`feat/xyz` یا `fix/xyz`)
2. Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
3. `npm run lint` و `npx tsc --noEmit` باید pass کنند
4. تست‌های مربوطه را اجرا/افزوده کنید
5. PR با توضیح کامل تغییرات

---

## 📄 لایسنس

MIT License — استفاده آزاد، تجاری، تغییر و توزیع با حفظ کپی‌رایت.

---

## 🔗 لینک‌های مفید

- **مستندات Next.js 14 App Router**: https://nextjs.org/docs/app
- **Drizzle ORM**: https://orm.drizzle.team
- **PostgreSQL 16 Docs**: https://www.postgresql.org/docs/16/
- **Redis Lua Scripting**: https://redis.io/docs/latest/develop/use/patterns/atomic-operations/
- **MinIO S3 API**: https://min.io/docs/minio/linux/developers/minio-sdk.html
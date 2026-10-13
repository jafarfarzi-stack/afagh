-- ════════════════════════════════════════════════════════════════════════
-- 0046 — ستون‌ها و جدول‌های لازم برای گزارش سالانهٔ «سهام» (IRPHE)
-- ────────────────────────────────────────────────────────────────────────
--  سامانهٔ سهام (saham.irphe.ac.ir) سالانه چهار فایل اکسل با سرستون ثابت
--  می‌گیرد (دانشجو / دانش‌آموخته / آموزشگر / کارمند) و مقادیرش *متنی* است؛
--  راهنمای رسمی می‌گوید مقادیر باید دقیقاً با «نگاشت» سامانه معادل‌سازی شوند.
--
--  این مهاجرت سه چیز اضافه می‌کند:
--   ۱) ستون‌های گمشدهٔ دانشجو که در هیچ جدولی نبودند (شیوه آموزش، نوع تحصیل،
--      تاهل، استان/شهر تولد و سکونت، وضعیت انتقال/مهمان، روش پذیرش، نحوهٔ
--      پرداخت شهریه، رتبهٔ آزمون، شناسهٔ فراگیر اتباع).
--      بقیهٔ ستون‌های سهام از قبل در users / students / majors / degrees /
--      geo_* هستند و فقط نگاشت می‌خواهند.
--   ۲) saham_institute_codes — کد ۱۲ رقمی «واحد/دانشکده» که سهام می‌خواهد
--      (faculties.standardCode در همهٔ ردیف‌ها خالی بود، پس جدا لازم است).
--   ۳) saham_value_maps — نگاشت قابل‌ویرایش «کد داخلی ما → متن سهام».
--
--  همهٔ دستورها idempotent هستند (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ════════════════════════════════════════════════════════════════════════

-- ── ۱) ستون‌های جدید دانشجو ───────────────────────────────────────────
-- شیوه آموزش (حضوری/نیمه حضوری/غیر حضوری) جدا از نوع تحصیل (روزانه/شبانه/…)
-- تا ابهام ستون studyingMode سما رفع شود.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "teachingMode" varchar(50);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "studyType" varchar(50);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "maritalStatus" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "birthProvince" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "birthCity" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "residenceProvince" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "residenceCity" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "transferGuestStatus" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "admissionMethod" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "tuitionPaymentMethod" varchar(100);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "entranceExamRank" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "foreignStudentId" varchar(30);

-- ── ۲) کد واحد/دانشکده برای سهام ───────────────────────────────────────
-- یک واحد می‌تواند به چند «دانشکده» در سهام نگاشت شود (حوزهٔ ستادی، …)؛
-- برای همین جدول جدا از faculties است و با facultyId اختیاری وصل می‌شود.
-- facultyId NULL = کل مؤسسه (موسسه‌های تک‌واحدی زرینه/شمس/نژند/علامه).
CREATE TABLE IF NOT EXISTS "saham_institute_codes" (
  "id" serial PRIMARY KEY,
  "universityId" integer NOT NULL REFERENCES "universities"("id") ON DELETE CASCADE,
  "facultyId" integer REFERENCES "faculties"("id") ON DELETE SET NULL,
  "title" varchar(150) NOT NULL,
  "code" varchar(20) NOT NULL,              -- کد ۱۲ رقمی سهام (حتماً Text در اکسل)
  "provinceCode" varchar(20),                -- geo_provinces.code
  "cityCode" varchar(20),                    -- geo_cities.code
  "isDefault" integer DEFAULT 0,             -- ۱ = برای رکوردهای بدون دانشکده استفاده شود
  "isActive" integer DEFAULT 1,
  "createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_saham_inst_code" ON "saham_institute_codes" ("universityId", "code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saham_inst_fac" ON "saham_institute_codes" ("facultyId");

-- ⚠ سید کدهای سهام این‌جا نیست — عمداً.
-- پیش‌تر همین‌جا با `facultyId`های ثابت (1، 2، 4) درج می‌شد و چون هیچ مهاجرتی
-- `faculties` را نمی‌سازد (فقط `scripts/seed-base.mjs`، بعد از مهاجرت‌ها)،
-- روی هر دیتابیس تازه با خطای FK می‌شکست:
--   saham_institute_codes_facultyId_fkey — Key (facultyId)=(2) is not present
-- و چون drizzle همهٔ مهاجرت‌ها را در یک تراکنش می‌بندد، کل زنجیره rollback می‌شد.
-- سید به `scripts/seed-saham-codes.mjs` منتقل شد (idempotent، مبتنی بر کد، نه id)
-- و باید بعد از `seed-base` اجرا شود.

-- ── ۳) نگاشت «کد داخلی → متن سهام» (قابل ویرایش از رابط) ───────────────
CREATE TABLE IF NOT EXISTS "saham_value_maps" (
  "id" serial PRIMARY KEY,
  "field" varchar(40) NOT NULL,      -- نام ستون سهام (مثلاً student_status)
  "sourceValue" varchar(100) NOT NULL,-- مقدار فعلی سیستم ما
  "sahamTitle" varchar(150) NOT NULL,-- متنی که سهام می‌پذیرد
  "isActive" integer DEFAULT 1,
  "createdAt" timestamp DEFAULT now(),
  CONSTRAINT "uq_saham_value_map" UNIQUE ("field", "sourceValue")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saham_value_map_field" ON "saham_value_maps" ("field");

-- نگاشت‌های قطعی (مقادیر سهام از codes.xlsx — «جدول شماره ۴» و غیره).
-- عمداً فقط موارد بدون ابهام سید شده‌اند؛ سهمیه/پذیرش/شهریه که در سیستم
-- ما کد داخلی دارند و معادل سهام نیستند، خالی گذاشته شده‌اند تا کاربر
-- در صفحهٔ تنظیمات سهام خودش انتخاب کند (بهتر از دادهٔ غلط).
INSERT INTO "saham_value_maps" ("field","sourceValue","sahamTitle") VALUES
 -- وضعیت کلی دانشجو → codes.xlsx «جدول شماره ۴»
 ('student_status','ACTIVE',    'فعال'),
 ('student_status','GRADUATED', 'غیرفعال - فارغ التحصیل ( دانش آموخته )'),
 ('student_status','WITHDRAWN', 'غیرفعال - انصراف ( ترک تحصیل )'),
 ('student_status','TRANSFERRED','غیرفعال - انصراف ( ترک تحصیل )'),
 ('student_status','EXPELLED',  'غیرفعال - اخراج'),
 ('student_status','SUSPENDED', 'غیرفعال - محروم از تحصیل'),
 ('student_status','DECEASED',  'غیرفعال - فوت'),
 ('student_status','NO_SHOW',   'غیرفعال - بلا تکلیف'),
 ('student_status','UNKNOWN',   'غیرفعال - سایر'),
 -- جنسیت → codes.xlsx «شیوه آموزش» جدول ۱ نیست؛ از متن راهنما: زن - مرد
 ('gender','FEMALE','زن'),
 ('gender','MALE','مرد'),
 -- دین → ministry_shared_codes RELIGION
 ('religion','1','شيعه'),
 ('religion','2','سني'),
 ('religion','3','كاتوليك'),
 -- تاهل → ministry_shared_codes MARITAL
 ('marital','1','مجرد'),
 ('marital','2','متاهل'),
 ('marital','3','مطلقه'),
 ('marital','4','بدون همسر(فوت شده )'),
 -- شیوه آموزش → codes.xlsx «جدول شماره ۱»
 ('teaching_mode','1','حضوری'),
 ('teaching_mode','2','نیمه حضوری'),
 ('teaching_mode','3','غیر حضوری'),
 -- نوع تحصیل → codes.xlsx «جدول شماره ۲»
 ('study_type','1','روزانه'),
 ('study_type','2','شبانه'),
 ('study_type','3','پرديس'),
 ('study_type','4','فراگير'),
 ('study_type','5','پودماني'),
 ('study_type','6','نيمه حضوري'),
 ('study_type','7','الكترونيكي'),
 ('study_type','8','مشترك')
ON CONFLICT DO NOTHING;
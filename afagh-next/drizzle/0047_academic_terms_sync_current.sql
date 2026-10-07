-- ══════════════════════════════════════════════════════════════════════
-- 0047 — یکتایی «نیمسال فعال» در هر دانشگاه + همگام‌سازی پرچم با تاریخ
-- ────────────────────────────────────────────────────────────────────────
--  academic_terms.isCurrent پرچم دستیِ «نیمسال جاری» است و در تولید سه
--  ردیف کهنه دارد که هیچ‌کدام با تاریخ امروز هم‌خوان نیست (۱۱۱/دانشگاه ۱،
--  ۶۲۷/دانشگاه ۳، ۶۵۷/دانشگاه ۴). تاریخ‌های نیمسال‌های دانشگاه ۴ هم در
--  سال‌های ۲۶۳۲ تا ۲۶۴۴ میلادی ثبت شده‌اند (سال شمسی در ستون timestamp)،
--  پس هیچ نیمسالی در تولید بازهٔ «امروز» را پوشش نمی‌دهد.
--
--  این مهاجرت وضعیت را از تاریخ بیرون می‌کشد: هر دانشگاه یا دقیقاً یک
--  نیمسال فعال دارد که بازهٔ تاریخش امروز را در بر می‌گیرد، یا هیچ. پرچمِ
--  کهنه صفر می‌شود چون همهٔ موتورهای سامانه (ثبت‌نام، کارتابل، نمره،
--  لیست حضور) با isCurrent=1 کار می‌کنند و نیمسال ۱۳۹۹ را «جاری» نشان
--  می‌دهند؛ نبودِ پرچم وضعیتِ درست‌تری است و دانشگاه‌های ۲ و ۵ همین
--  حالا پرچم فعال ندارند. افزودن نیمسال‌های به‌روز و انتخاب فعال، کارِ
--  «فعال‌سازی گروهی» در صفحهٔ /admin/terms است.
--
--  این کار فقط academic_terms را لمس می‌کند و هر گامش idempotent است؛
--  اجرای دوباره همان نتیجه را می‌دهد، نه خطا:
--   ۱) پاک‌سازی کامل پرچم، ۲) فعال‌سازی نیمسالِ شامل now()،
--   ۳) رفع تکرارِ باقی‌مانده (دفاعی، برای اینکه ساخت ایندکس شکست نخورد)،
--   ۴) قیدِ پایگاه‌داده: حداکثر یک نیمسال فعال در هر دانشگاه.
--
--  قاعدهٔ انتخاب: startDate <= now() AND (endDate IS NULL OR endDate >= now())
--  و در میان چند نیمسالِ هم‌زمان، تازه‌ترین startDate و سپس بزرگ‌ترین id
--  (DISTINCT ON) تا نتیجه قطعی و تکرارپذیر باشد. نیمسال با startDate NULL
--  هرگز واجد شرط نیست، پس هرگز فعال نمی‌شود.
-- ═══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
-- ۱) پاک‌سازی کامل: هر پرچمِ فعالِ پیشین، چه دستی چه نیمسالی که دیگر
--    جاری نیست، صفر می‌شود تا مبنای تصمیم فقط تاریخ باشد.
UPDATE "academic_terms"
SET "isCurrent" = 0
WHERE COALESCE("isCurrent", 0) <> 0;

--> statement-breakpoint
-- ۲) فعال‌سازی: برای هر دانشگاه، تازه‌ترین نیمسالی که now() داخل بازهٔ
--    آن است.
WITH winners AS (
  SELECT DISTINCT ON ("universityId") id
  FROM "academic_terms"
  WHERE "universityId" IS NOT NULL
    AND "startDate" IS NOT NULL
    AND "startDate" <= now()
    AND ("endDate" IS NULL OR "endDate" >= now())
  ORDER BY "universityId", "startDate" DESC, id DESC
)
UPDATE "academic_terms" t
SET "isCurrent" = 1
FROM winners w
WHERE t.id = w.id
  AND COALESCE(t."isCurrent", 0) <> 1;

--> statement-breakpoint
-- ۳) رفع تکرارِ دفاعی: اگر داده‌ای در گام ۲ از قاعده جا مانده بود، فقط
--    تازه‌ترین ردیفِ هر دانشگاه فعال می‌ماند تا گام ۴ شکست نخورد.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "universityId"
           ORDER BY "startDate" DESC NULLS LAST, id DESC
         ) AS rn
  FROM "academic_terms"
  WHERE COALESCE("isCurrent", 0) = 1
    AND "universityId" IS NOT NULL
)
UPDATE "academic_terms" t
SET "isCurrent" = 0
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

--> statement-breakpoint
-- ۴) قید: از این پس «دو نیمسال فعال در یک دانشگاه» در سطح پایگاه‌داده
--    ناممکن است. مسیرهای نوشتن (فعال‌سازی تکی و گروهی در /admin/terms)
--    همین قاعده را در یک تراکنش رعایت می‌کنند.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_academic_terms_current_per_university"
  ON "academic_terms" ("universityId") WHERE COALESCE("isCurrent", 0) = 1;

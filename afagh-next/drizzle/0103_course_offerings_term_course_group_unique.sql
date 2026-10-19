-- ────────────────────────────────────────────────────────────────────────
-- 0103 — H1: یکتایی (ترم + درس + گروه) برای ارائه‌های «فعال»
--
-- چرا: بررسی تکراری فقط در سطح اپ بود (findDuplicateOffering در
-- offering-scheduling.ts). دو درخواست هم‌زمانِ «ساخت/ویرایش ارائه»، هر دو از
-- گارد می‌گذشتند و دو ردیف با همان (termId, courseId, groupNumber) می‌نشاندند
-- (یافتهٔ E1 در هارنس gm1 روی استیجینگ). این ایندکس یکتا همان تضاد را روی
-- دیتابیس قطعی می‌کند — لایهٔ آخر دفاع، فراتر از گارد اپ.
--
-- چرا «جزئی» (WHERE isActive = 1)؟
--   • قاعدهٔ کسب‌وکار این است: در هر ترم، برای هر (درس+گروه) حداکثر یک ارائهٔ
--     «فعال» وجود دارد. ارائهٔ غیرفعال‌شده تاریخچه است (deactivateOfferingAction
--     وقتی ثبت‌نام دارد ردیف را isActive=0 نگه می‌دارد) و نباید مانع ساخت
--     ارائهٔ جدید همان درس/گروه شود — نه در DB و نه در اپ.
--   • رفع تکراری‌های احتمالیِ پیش از مهاجرت هم غیرتخریبی می‌شود: کافی است
--     ردیف‌های اضافی غیرفعال شوند؛ هیچ ردیف/ثبت‌نامی حذف نمی‌شود.
--
-- پیش‌شرط: اگر در دیتابیس هدف، بیش از یک ارائهٔ «فعال» با همان کلید باشد،
-- مهاجرت عمداً و با پیام صریح متوقف می‌شود (fail-fast). ابزار رفع:
--     node scripts/offering-duplicates.mjs           # گزارش
--     node scripts/offering-duplicates.mjs --fix     # ادغام ایمن + غیرفعال‌سازی
--
-- ایندکس غیریکتای قبلی (offerings_term_course_group_idx) دقیقاً همین ستون‌ها
-- را داشت؛ ایندکس یکتای جدید همان مسیر جست‌وجو را هم پوشش می‌دهد، پس آن زائد
-- است و حذف می‌شود.
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE dup_groups int;
BEGIN
  SELECT count(*) INTO dup_groups FROM (
    SELECT 1
    FROM "course_offerings"
    WHERE "isActive" = 1
    GROUP BY "termId", "courseId", "groupNumber"
    HAVING count(*) > 1
  ) d;
  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'H1 pre-flight: % group(s) of ACTIVE duplicate offerings on (termId,courseId,groupNumber). Run `node scripts/offering-duplicates.mjs --fix` before migrating.',
      dup_groups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_course_offerings_term_course_group"
  ON "course_offerings" USING btree ("termId", "courseId", "groupNumber")
  WHERE "isActive" = 1;

DROP INDEX IF EXISTS "offerings_term_course_group_idx";

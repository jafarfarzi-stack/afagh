-- ══════════════════════════════════════════════════════════════════════
-- 0035 — پرکردن academic_terms.sortOrder و academicYear
--
-- چرا؟ هر دو ستون هنگام ایمپورت خالی مانده بودند (۰ از ۳۳۳ ترم). ستون
-- sortOrder مرجع ترتیب زمانی ترم‌هاست و در ORDER BY و در
-- src/lib/term-chronology.ts استفاده می‌شود. تا وقتی NULL بود، همهٔ
-- مرتب‌سازی‌ها به fallback روی termCode می‌افتادند.
--
-- نکتهٔ سازگاری: مقداری که اینجا می‌نویسیم دقیقاً همان چیزی است که
-- termChronologicalValue(termCode, NULL) از قبل محاسبه می‌کرد، پس این
-- backfill «رفتار را تغییر نمی‌دهد» — فقط NULL را به مقدار قطعی تبدیل
-- می‌کند و ترتیب را در SQL هم درست می‌کند. اجرای مجدد بی‌خطر (idempotent).
--
-- منطق نرمال‌سازی کد ترم (همان که در term-chronology.ts است):
--   طول ۳            → '13' + کد        (مثال: 992 → ۱۳۹۹۲)
--   طول ۴ و با 4 یا 0 → '1' + کد         (مثال: 4001 → ۱۴۰۰۱)
--   بقیه              → همان کد به عدد
-- academicYear = ⌊sortOrder / 10⌋  (۱۳۹۱۱ → ۱۳۹۱ ، ۸۹۱ → ۱۳۸۹)
-- ═══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
UPDATE "academic_terms"
SET "sortOrder" = (
  CASE
    WHEN "termCode" ~ '^\d{3}$'            THEN ('13' || "termCode")::int
    WHEN "termCode" ~ '^\d{4}$' AND left("termCode", 1) IN ('4', '0')
                                          THEN ('1'  || "termCode")::int
    WHEN "termCode" ~ '^\d+$'               THEN "termCode"::int
  END
)
WHERE "sortOrder" IS NULL
  AND "termCode" ~ '^\d+$';

--> statement-breakpoint
UPDATE "academic_terms"
SET "academicYear" = "sortOrder" / 10
WHERE "academicYear" IS NULL
  AND "sortOrder" IS NOT NULL;

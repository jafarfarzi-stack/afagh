-- 0136_tuition_price_codes.sql
-- «قالب کدهای شهریهٔ کارنامهٔ مالی نوع الف» — بهازای نیمسالِ ورود دانشجو
--
-- سربرگ هر نیمسال در سند قدیمی سما چهار کد دارد:
--   کد ثابت · اولیهٔ ثابت · کد متغیر · اولیهٔ متغیر
--   ▸ کد ثابت (FPrice_code) در تمام ترمها ثابت است و از «قالب نیمسال ورود» میآید.
--   ▸ کد متغیر (UPrice_code) سالبهسال عوض میشود و در tuition_term_tariff هست.
--   ▸ «اولیهٔ متغیر» همان کد متغیرِ سالِ ورود است؛ «اولیهٔ ثابت» = کد ثابت.
--
-- پیش از این مهاجرت FPrice_code هیچجایی ذخیره نشده بود (اسکریپت
-- extract-uems-tuition.mjs آن را استخراج میکرد ولی import-uems-tuition.mjs
-- دور میریخت). پس اینجا محلِ قابلپیکربندیش ساخته میشود تا کدنویسی هیچ
-- عددی را سختکد نکند و همگی از دیتابیس خوانده شوند.
--
-- همهٔ عبارتها idempotentاند و دادهٔ موجود بازنویسی نمیشود.

BEGIN;

CREATE TABLE IF NOT EXISTS tuition_price_code_templates (
  id                        serial PRIMARY KEY,
  "universityId"            integer REFERENCES universities(id),
  "majorId"                 integer REFERENCES majors(id),
  "degreeLevelId"           integer REFERENCES degree_level_configs(id),
  "entryYear"               integer NOT NULL DEFAULT 0,  -- ۰ = همهٔ سالهای ورود
  "entryTerm"               integer NOT NULL DEFAULT 0,  -- ۰ = همهٔ نیمسالهای ورود
  "fixedPriceCode"          varchar(30),                -- کد ثابت (FPrice_code)
  "initialFixedPriceCode"   varchar(30),                -- اولیهٔ کد ثابت (پیشفرض = کد ثابت)
  "initialVariablePriceCode" varchar(30),               -- اولیهٔ کد متغیر (UPrice_code سال ورود)
  source                    varchar(40) NOT NULL DEFAULT 'SAMA',
  note                      text,
  "isActive"                integer NOT NULL DEFAULT 1,
  "updatedAt"               timestamp NOT NULL DEFAULT now()
);

-- NULL یعنی «wildcard»؛ COALESCE باعث میشود ردیف سراسری و ردیف خاص تداخل نکنند.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tuition_price_code_template
  ON tuition_price_code_templates (
    COALESCE("universityId", 0),
    COALESCE("majorId", 0),
    COALESCE("degreeLevelId", 0),
    "entryYear",
    "entryTerm"
  );
CREATE INDEX IF NOT EXISTS idx_tuition_price_code_lookup
  ON tuition_price_code_templates ("universityId", "majorId", "entryYear", "entryTerm");

-- محل ذخیرهٔ کد ثابتِ همان سال در جدول تعرفه (برای واردسازیهای بعدی TermPrice).
ALTER TABLE tuition_term_tariff
  ADD COLUMN IF NOT EXISTS "fPriceCode" varchar(30);

-- ── بذرِ واقعی: «اولیهٔ کد متغیر» از تعرفهٔ رسمی همان سالِ ورود ──────────
-- برای هر (دانشگاه، رشته، سال ورود) یک قالب ساخته میشود؛ کد ثابت عمداً NULL
-- میماند تا عددِ نادرست چاپ نشود. کارشناس مالی بااسکریپت
-- scripts/import-tuition-price-codes.mjs آن را از خروجی TermPrice پُر میکند.
-- degreeLevelId عمداً NULL (wildcard) است تا ردیف بذر با ردیف مقطعدار تداخل
-- نکند و حلگر «خاصترین ردیف برنده» همیشه همان ردیف حاوی کد ثابت را بگیرد.
WITH tariff_years AS (
  SELECT "universityId", "majorId", "entryYear", btrim("uPriceCode") AS code,
         COALESCE(
           "termYear",
           CASE WHEN "termCode" ~ '^[0-9]{4}' THEN left("termCode", 4)::int END
         ) AS yr
  FROM tuition_term_tariff
  WHERE "uPriceCode" IS NOT NULL AND btrim("uPriceCode") <> ''
), picked AS (
  SELECT DISTINCT ON ("universityId", "majorId", "entryYear")
         "universityId", "majorId", "entryYear", code
  FROM tariff_years
  ORDER BY "universityId", "majorId", "entryYear",
           CASE WHEN yr = "entryYear" THEN 0 ELSE 1 END,
           yr NULLS LAST
)
INSERT INTO tuition_price_code_templates
  ("universityId", "majorId", "degreeLevelId", "entryYear", "entryTerm",
   "initialVariablePriceCode", source, note)
SELECT p."universityId", p."majorId", NULL, p."entryYear", 0,
       p.code, 'SAMA_TARIFF',
       'اولیهٔ متغیر از tuition_term_tariff سال ورود؛ کد ثابت (FPrice_code) با واردسازی TermPrice تکمیل شود'
FROM picked p
WHERE NOT EXISTS (
  SELECT 1 FROM tuition_price_code_templates x
  WHERE COALESCE(x."universityId", 0) = COALESCE(p."universityId", 0)
    AND COALESCE(x."majorId", 0)      = COALESCE(p."majorId", 0)
    AND COALESCE(x."degreeLevelId", 0) = 0
    AND x."entryYear" = p."entryYear"
    AND x."entryTerm" = 0
);

-- ── نمونهٔ تأییدشدهٔ همکاران مالی (کارنامهٔ نوع الف، نیمسال ۱۳۹۰۳) ────────
-- کد متغیر 3990121 عیناً در tuition_term_tariff (دانشگاه ۱ / رشته ۱۱۰ /
-- ورودی ۱۳۹۰ / ترم 13901) موجود است؛ کد ثابت 221901901 در دیتابیس نبود و
-- اینجا بهعنوان بذرِ قابلویرایش ثبت میشود (هیچ کُدی در لایهٔ نمایش سختکد نیست).
-- ابتدا اگر هیچ ردیفی برای این ورودی نبود یکی ساخته میشود، سپس **همهٔ**
-- ردیفهایش بهروز میشوند تا ردیف مقطعدارِ بدون کد ثابت، ردیف درست را نپوشاند.
INSERT INTO tuition_price_code_templates
  ("universityId", "majorId", "degreeLevelId", "entryYear", "entryTerm", source, note)
SELECT 1, 110, NULL, 1390, 0, 'LEGACY_TRANSCRIPT',
       'نمونهٔ تأییدشدهٔ کارنامهٔ مالی نوع الف (نیمسال ۱۳۹۰۳)'
WHERE NOT EXISTS (
  SELECT 1 FROM tuition_price_code_templates x
  WHERE COALESCE(x."universityId", 0) = 1
    AND COALESCE(x."majorId", 0) = 110
    AND COALESCE(x."degreeLevelId", 0) = 0
    AND x."entryYear" = 1390
    AND x."entryTerm" = 0
);

UPDATE tuition_price_code_templates
SET "fixedPriceCode"           = '221901901',
    "initialFixedPriceCode"    = '221901901',
    "initialVariablePriceCode" = '3990121',
    source                     = 'LEGACY_TRANSCRIPT',
    note                       = 'نمونهٔ تأییدشدهٔ کارنامهٔ مالی نوع الف: کد ثابت 221901901 / کد متغیر اولیه 3990121',
    "updatedAt"                = now()
WHERE "universityId" = 1 AND "majorId" = 110 AND "entryYear" = 1390;

COMMIT;

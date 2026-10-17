-- 0098 — تعرفهٔ تفصیلی سما: کلید «سال» (نیمسال‌های یک سال نرخ یکسان دارند)
--
-- کدِ قیمت سما سال را در خود دارد (35403952 = سال 1403) و برای همهٔ نیمسال‌های
-- آن سال (مهر/بهمن/تابستان) یکسان است. جدول TermPrice فقط برای بعضی نیمسال‌ها
-- ردیف دارد (14031 دارد، 14032 ندارد)؛ پس کلید درست «سال» است و اگر با کد نیمسال
-- جست‌وجو شود، نیمسال‌های بدون ردیف از تعرفه محروم می‌مانند.

--> statement-breakpoint
ALTER TABLE "tuition_term_tariff" ADD COLUMN IF NOT EXISTS "termYear" integer;

--> statement-breakpoint
UPDATE "tuition_term_tariff"
   SET "termYear" = NULLIF(left("termCode", 4), '')::int
 WHERE "termYear" IS NULL AND "termCode" ~ '^[0-9]{4}';

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tuition_term_tariff_year"
  ON "tuition_term_tariff" ("universityId", "termYear", "majorId", "entryYear");

-- 0097 — تعرفهٔ تفصیلی نیمسال‌های گذشته (سامانهٔ سما)
--
-- سما نرخ هر واحد را به «نوع درس مالی» (Mali_type) گره می‌زند:
--     مبلغ درس = واحدهای نظری × thPrice + واحدهای عملی × opPrice
-- و این نرخ‌ها هر نیمسال عوض می‌شوند. برای بازتولید ریال‌به‌ریال کارنامهٔ مالیِ
-- نیمسال‌های گذشته (سند رسمی دانشگاه) این تفصیل لازم است؛ مدل `tuition_rules`
-- (سه نرخ بدون بُعد نیمسال/نوع درس) از عهدهٔ آن برنمی‌آید.
--
-- ستون `courses.legacyMaliType` هم «نوع درس مالی» هر درس را از جدول LT7
-- سامانهٔ مبدأ نگه می‌دارد تا کد درس → نرخ درست وصل شود.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tuition_term_tariff" (
  "id" serial PRIMARY KEY,
  "universityId" integer REFERENCES "universities"("id"),
  "termCode" varchar(20) NOT NULL,
  "majorId" integer REFERENCES "majors"("id"),
  "entryYear" integer NOT NULL,
  "maliType" integer NOT NULL,
  "thPrice" numeric(16, 2) NOT NULL DEFAULT '0',
  "opPrice" numeric(16, 2) NOT NULL DEFAULT '0',
  "uPriceCode" varchar(20),
  "source" varchar(40) DEFAULT 'SAMA',
  "updatedAt" timestamp DEFAULT now()
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tuition_term_tariff"
  ON "tuition_term_tariff" ("universityId", "termCode", "majorId", "entryYear", "maliType");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tuition_term_tariff_lookup"
  ON "tuition_term_tariff" ("universityId", "termCode", "majorId", "entryYear");

--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "legacyMaliType" integer;

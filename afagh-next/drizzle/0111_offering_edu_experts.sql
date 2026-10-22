-- تخصیص «چند کارشناس آموزش» به یک کلاس.
--
-- تا پیش از این، هر ارائه فقط یک ستون `course_offerings.eduExpertUserId` داشت
-- و در نتیجه یک کلاس فقط می‌توانست به یک کارشناس سپرده شود. در عمل یک کلاس
-- ممکن است بین دو یا چند کارشناس مشترک باشد (مثلاً درسِ مشترکِ دو گروه، یا
-- تقسیم کارِ کارشناسِ آموزش و کارشناسِ دانشکده). پس رابطه به جدولِ واسط
-- تبدیل می‌شود: هر تعداد کارشناس برای هر ارائه.
--
-- ستونِ قدیمی حذف نمی‌شود؛ به‌عنوان «کارشناسِ اصلی» (اولین نفر) نگه داشته
-- می‌شود تا مصرف‌کننده‌های تک‌مقداری و گزارش‌های موجود نشکنند.

-- ۰) محافظ: اگر مهاجرتِ ۰۱۱۰ روی این دیتابیس اجرا نشده باشد، اینجا ساخته شود
--    (چون در دفترچهٔ مهاجرت ثبت نشده و ممکن است دستی اعمال شده باشد).
ALTER TABLE "course_offerings"
  ADD COLUMN IF NOT EXISTS "eduExpertUserId" integer REFERENCES users(id) ON DELETE SET NULL;

-- ۱) جدولِ واسط: (ارائه، کارشناس)
CREATE TABLE IF NOT EXISTS "course_offering_edu_experts" (
  "id" serial PRIMARY KEY,
  "offeringId" integer NOT NULL REFERENCES "course_offerings"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- ۲) یک کارشناس برای یک ارائه فقط یک بار
CREATE UNIQUE INDEX IF NOT EXISTS "uq_co_edu_experts_offering_user"
  ON "course_offering_edu_experts" ("offeringId", "userId");

-- ۳) پرس‌وجوی «کلاس‌های یک کارشناس» (کارتابل کارشناس آموزش)
CREATE INDEX IF NOT EXISTS "idx_co_edu_experts_user"
  ON "course_offering_edu_experts" ("userId");

-- ۴) انتقالِ دادهٔ موجود: هر تخصیصِ تک‌مقداری به یک ردیفِ جدولِ واسط
INSERT INTO "course_offering_edu_experts" ("offeringId", "userId")
SELECT "id", "eduExpertUserId"
FROM "course_offerings"
WHERE "eduExpertUserId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- ۵) هم‌ترازی با سخت‌سازیِ امنیتی (scripts/hardening.mjs): آن اسکریپت مجوزها و
--    سیاست‌های پشتیبان‌گیری را روی جدول‌های «موجود در آن لحظه» می‌سازد، پس جدولِ
--    تازه‌ساخته بدون این بلوک از دامپِ afagh_backup جا می‌ماند. اگر نقش وجود
--    نداشته باشد (محیطِ توسعه) بی‌صدا رد می‌شود.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afagh_backup') THEN
    EXECUTE 'GRANT SELECT, INSERT, TRUNCATE ON "course_offering_edu_experts" TO afagh_backup';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'course_offering_edu_experts'
        AND policyname = 'afagh_backup_read'
    ) THEN
      EXECUTE 'CREATE POLICY afagh_backup_read ON "course_offering_edu_experts" FOR SELECT TO afagh_backup USING (true)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'course_offering_edu_experts'
        AND policyname = 'afagh_backup_insert'
    ) THEN
      EXECUTE 'CREATE POLICY afagh_backup_insert ON "course_offering_edu_experts" FOR INSERT TO afagh_backup WITH CHECK (true)';
    END IF;
  END IF;
END $do$;

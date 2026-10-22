-- «گروهِ مسئولِ اتاق» — ادغامِ تخصیص اتاق با تخصیصِ کلاس به مدیرگروه.
--
-- چرا: تا امروز مسئولیتِ یک اتاق فقط از روی سانس‌هایش استنتاج می‌شد (گروهی که
-- درسش در آن اتاق برگزار می‌شود). نتیجه این بود که یک اتاقِ مشترک (مثل
-- «كلاس 1 عمومي») در فهرستِ چند گروه می‌افتاد و هیچ‌کس صاحبِ واقعیِ آن نبود.
-- با این ستون، مدیر سامانه صریحاً می‌گوید «این اتاق در اختیارِ کدام گروه است»
-- و از همان‌جا مدیرگروه (departments.headStaffId) هم مشخص می‌شود.
--
-- ستون nullable است: اتاق‌های بدون تخصیص مثل قبل با استنتاجِ سانس‌ها کار
-- می‌کنند، پس هیچ داده‌ای از دست نمی‌رود و مهاجرت بی‌خطر است.

ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "departmentId" integer;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classrooms_departmentId_fkey'
  ) THEN
    ALTER TABLE "classrooms"
      ADD CONSTRAINT "classrooms_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL;
  END IF;
END $do$;

-- فهرستِ «اتاق‌های گروه من» در پنل مدیر گروه و کارتابل کنترل‌کننده
CREATE INDEX IF NOT EXISTS "idx_classrooms_department" ON "classrooms" ("departmentId");

-- ستون اصلی کد وضعیت سما (کد وارداتی اولیه) برای مقایسه بعدی با موتور آیین‌نامه
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "originalSamaCode" varchar(10);

-- کپی کد وضعیت فعلی به‌عنوان «کد اصلی» برای رکوردهایی که هنوز خالی‌اند.
-- همان کاری که scripts/migrate-original-code.mjs روی پروداکشن انجام داد؛ بدون آن،
-- هر دیتابیس تازه‌ای این ستون را برای همیشه خالی می‌گیرد و موتور آیین‌نامه
-- (src/lib/resolve-sama-code.ts) دیگر «کد اولیه در برابر کد فعلی» را نمی‌تواند نشان دهد.
-- idempotent: روی دیتابیسی که قبلاً پر شده، هیچ ردیفی تغییر نمی‌کند.
UPDATE "enrollments"
SET "originalSamaCode" = "samaGradeStatusCode"
WHERE "originalSamaCode" IS NULL
  AND "samaGradeStatusCode" IS NOT NULL;

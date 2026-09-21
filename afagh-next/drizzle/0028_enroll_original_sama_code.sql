-- ستون اصلی کد وضعیت سما (کد وارداتی اولیه) برای مقایسه بعدی با موتور آیین‌نامه
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "originalSamaCode" varchar(10);

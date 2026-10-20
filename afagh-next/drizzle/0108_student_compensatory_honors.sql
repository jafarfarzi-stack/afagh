-- 0108: پروندهٔ جبرانی و ممتازی دانشجو
--   compensatoryUnits      واحدهای جبرانیِ تعیین‌شده توسط مدیر گروه (به سقف واحد ترم اضافه می‌شود)
--   previousMajor*         رشتهٔ قبلی (منبع: سازمان سنجش) برای تشخیص دانشجوی جبرانی
--   honorsOverride         اورراید دستی شاگرد ممتاز: NULL=خودکار، 1=ممتاز، 0=غیرممتاز
-- همهٔ ستون‌ها nullable/با default امن‌اند؛ دادهٔ موجود دست‌نخورده می‌ماند.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "compensatoryUnits" integer NOT NULL DEFAULT 0;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "previousMajorCode" varchar(20);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "previousMajorTitle" varchar(150);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "previousMajorRelation" varchar(20);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "honorsOverride" integer;

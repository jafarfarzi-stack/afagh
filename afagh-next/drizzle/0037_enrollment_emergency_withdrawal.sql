-- Add emergencyWithdrawal field to enrollments table
-- ستون NOT NULL است (هم‌راستا با src/db/schema.ts): تنها نویسنده emergencyDropAction مقدار ۱
-- می‌نویسد و هیچ مسیری NULL نمی‌نویسد → مقدار پیش‌فرض ۰ برای ردیف‌های موجود کافی است.
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "emergencyWithdrawal" integer NOT NULL DEFAULT 0;
-- idempotency: اگر ستون از قبل (nullable) ساخته شده باشد، NULLها پاک و NOT NULL اعمال می‌شود
UPDATE "enrollments" SET "emergencyWithdrawal" = 0 WHERE "emergencyWithdrawal" IS NULL;
ALTER TABLE "enrollments" ALTER COLUMN "emergencyWithdrawal" SET NOT NULL;
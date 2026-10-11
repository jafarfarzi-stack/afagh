-- ══════════════════════════════════════════════════════════════════════
-- 0066 — ثبت‌نام توسط کارشناس آموزش (به‌جای دانشجو) + ردگیری
--
-- اضافه‌کردن به enrollments:
--   enrolledByUserId     → چه کسی ثبت‌نام را انجام داده (کارشناس/مدیر)
--   enrollOverrideReason → چرا آیین‌نامه/پیش‌نیاز نادیده گرفته شده
--   enrollOverride       → آیا قیود (پیش‌نیاز/ظرفیت/سقف واحد) نادیده گرفته شده
-- تا بعداً ردیابی شود «کی انتخاب واحد را برای دانشجو زده» و با چه مجوزی.
-- اجرای مجدد بی‌خطر (IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "enrolledByUserId" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "enrollOverrideReason" text;
--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "enrollOverride" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_enrollments_enrolled_by ON "enrollments"("enrolledByUserId");
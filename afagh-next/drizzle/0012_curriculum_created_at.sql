-- ════════════════════════════════════════════════════════════════════════
-- 0012 — ستون curriculum_versions.createdAt
-- ────────────────────────────────────────────────────────────────────────
--  چرا لازم است: این ستون در src/db/schema.ts تعریف شده و مهاجرت 0002 (تغییر
--  نام syllabuses → curriculum_versions) تنها «updatedAt» را افزود؛ «createdAt»
--  هرگز ساخته نشد و در patches.sql هم نیست. چون loadVersionData («جزئیات نسخه»)
--  با select() ستون‌های کامل جدول را می‌خواند، در هر نصب تازه‌ای که با زنجیرهٔ
--  مهاجرت ساخته شود این خطا می‌افتاد:
--      error: column "curriculum_versions.createdAt" does not exist
--  و در نتیجه getCurriculumVersionDetailAction همیشه { ok:false } برمی‌گشت —
--  یعنی تب‌های «دروس کاتالوگ»، «ترم‌بندی چارت» و «بررسی و خاتمه»ٔ پنل برنامهٔ
--  درسی و ذخیرهٔ پیش‌نیاز/هم‌نیاز عملاً از کار می‌افتادند (در محیط توسعه دیده
--  نشد، چون drizzle-kit push ساختار را از خود TypeScript می‌سازد).
--  ▸ IF NOT EXISTS: روی دیتابیس‌های push‌شده یا قدیمی بی‌اثر است.
--  ▸ مقدار از updatedAt بازسازی می‌شود تا ردپای زمانی نسخه‌های موجود پر نباشد.
--  ▸ ایندکسی لازم نیست: خواندنی نیست و فقط برای نمایش/حسابرسی است.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now();
--> statement-breakpoint
UPDATE "curriculum_versions" SET "createdAt" = COALESCE("createdAt", "updatedAt", now()) WHERE "createdAt" IS NULL;

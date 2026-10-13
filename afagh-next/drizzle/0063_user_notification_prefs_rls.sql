-- 0063_user_notification_prefs_rls.sql
-- گیت hardening.mjs: هر جدول دارای userId باید RLS داشته باشد.
--
-- ⚠ اصلاح ۱۴۰۵/۰۷: این مهاجرت به جدولِ «user_notification_prefs» اشاره می‌کرد که
--   **هیچ‌جا ساخته نمی‌شود** — نه در مهاجرت‌ها، نه در patches.sql/pg-hardening.sql،
--   نه در src/db/schema.ts و نه در هیچ کد اپلیکیشن (تنها اشاره در همین فایل بود).
--   روی دیتابیس خالی این خط با «relation "user_notification_prefs" does not exist»
--   می‌شکست و چون drizzle همهٔ مهاجرت‌ها را در یک تراکنش می‌بندد، **کل زنجیره rollback
--   می‌شد** (۰ جدول، ۰ ردیف دفتر مهاجرت) ⇒ استقرار تازه غیرممکن بود.
--   روی دیتابیس فعلی این مهاجرت قبلاً ثبت شده؛ این تغییر برای آن بی‌اثر است
--   (drizzle فقط بر اساس created_at جلو می‌رود و مهاجرت‌های گذشته را دوباره اجرا نمی‌کند).
--
--   رفتار جدید: اگر جدول واقعاً وجود داشته باشد، همان سیاست قبلی اعمال می‌شود؛
--   اگر نباشد، بی‌صدا (و با هشدار) رد می‌شود تا زنجیره کامل شود. هرگاه جدول در
--   آینده ساخته شد، یک مهاجرت تازه همان RLS را می‌گذارد. عمداً CREATE TABLE
--   نمی‌زنیم: ساختن جدولِ بدون مصرف‌کننده، بدهی فنی است.
DO $$
BEGIN
  IF to_regclass('public.user_notification_prefs') IS NULL THEN
    RAISE WARNING '0063: جدول user_notification_prefs وجود ندارد — سیاست RLS آن رد شد (جدول روح؛ هیچ کدی از آن استفاده نمی‌کند).';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE "user_notification_prefs" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS user_notification_prefs_self ON "user_notification_prefs"';
  EXECUTE $pol$CREATE POLICY user_notification_prefs_self ON "user_notification_prefs" FOR ALL TO afagh_app
    USING ("userId" = nullif(current_setting('app.user_id', true), '')::int)$pol$;
END $$;
--> statement-breakpoint

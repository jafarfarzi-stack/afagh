-- 0042_pos_heartbeat_column_fix.sql
-- اصلاح نگاشت نام ستون در pos_terminals:
-- schema.ts ستون را last_heartbeat_at (snake_case) تعریف کرده اما 0041 آن را
-- lastHeartbeatAt ساخته بود → در زمان اجرا خطای
--   column "last_heartbeat_at" does not exist
-- رخ می‌داد و صفحهٔ /admin/finance/pos باز نمی‌شد.
-- این مایگریشن هر دو حالت را پوشش می‌دهد: دیتابیسی که 0041 را اجرا کرده
-- (کپی داده + حذف ستون قدیمی) و دیتابیس تازه (کافی است IF NOT EXISTS).
-- idempotent است.

-- ۱) اگر ستون قدیمی camelCase وجود دارد، داده‌اش را منتقل کن
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pos_terminals' AND column_name = 'lastHeartbeatAt'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pos_terminals' AND column_name = 'last_heartbeat_at'
    ) THEN
      ALTER TABLE "pos_terminals" ADD COLUMN "last_heartbeat_at" timestamp;
    END IF;
    UPDATE "pos_terminals"
       SET "last_heartbeat_at" = "lastHeartbeatAt"
     WHERE "last_heartbeat_at" IS NULL AND "lastHeartbeatAt" IS NOT NULL;
    ALTER TABLE "pos_terminals" DROP COLUMN "lastHeartbeatAt";
  END IF;
END $$;

-- ۲) تضمین وجود ستون با نام درست (دیتابیس‌هایی که اصلاً ستون را ندارند)
ALTER TABLE "pos_terminals" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp;
-- 0063_user_notification_prefs_rls.sql
-- گیت hardening.mjs: هر جدول دارای userId باید RLS داشته باشد.
ALTER TABLE "user_notification_prefs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_notification_prefs_self ON "user_notification_prefs";
CREATE POLICY user_notification_prefs_self ON "user_notification_prefs" FOR ALL TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

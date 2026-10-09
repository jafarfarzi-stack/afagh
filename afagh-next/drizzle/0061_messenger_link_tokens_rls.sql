-- 0061_messenger_link_tokens_rls.sql
-- گیت hardening.mjs: هر جدول دارای userId باید RLS داشته باشد.
ALTER TABLE "messenger_link_tokens" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messenger_link_tokens_self ON "messenger_link_tokens";
CREATE POLICY messenger_link_tokens_self ON "messenger_link_tokens" FOR ALL TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

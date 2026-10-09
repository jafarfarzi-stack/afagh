-- 0058_staff_term_roles_rls.sql
-- گیت hardening.mjs: هر جدول دارای staffId باید RLS داشته باشد، وگرنه استقرار
-- متوقف می‌شود. الگو عیناً staff_roles (self_read).
ALTER TABLE "staff_term_roles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_term_roles_self_read ON "staff_term_roles";
CREATE POLICY staff_term_roles_self_read ON "staff_term_roles" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

-- ════════════════════════════════════════════════════════════════════
--  سخت‌سازی PostgreSQL — پس از drizzle-kit push (سند §۲۰۹۳–۲۲۴۰)
--   ① ایندکس‌های جداول داغ  ② پارتیشن‌بندی ترمی  ③ امنیت سطح-ردیف RLS
--   ④ آرشیو سرد  ⑤ نگهداشت خودکار
-- ════════════════════════════════════════════════════════════════════

-- ① ایندکس‌های داغ (آینهٔ فاز صفر + کاربردهای کالبد)
CREATE INDEX IF NOT EXISTS idx_enr_student_pg ON "enrollments"("studentId");
CREATE INDEX IF NOT EXISTS idx_enr_offering_pg ON "enrollments"("offeringId");
CREATE INDEX IF NOT EXISTS idx_off_term_pg ON "course_offerings"("termId");
CREATE INDEX IF NOT EXISTS idx_sched_offering_pg ON "schedules"("offeringId");
CREATE INDEX IF NOT EXISTS idx_sessions_user_pg ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS idx_notif_user_pg ON "notifications"("userId");
CREATE INDEX IF NOT EXISTS idx_docs_staff_pg ON "electronic_documents"("staffId");
CREATE INDEX IF NOT EXISTS idx_req_status_pg ON "student_requests"("status");
CREATE INDEX IF NOT EXISTS idx_att_session_pg ON "student_class_attendance"("sessionId");

-- ② پارتیشن‌بندی ترمی (سند §۲۰۹۹) — الگو برای جداول حجیم:
--    در پروداکشن، enrollments/student_class_attendance به صورت LIST/TABLE partition
--    روی termId ساخته می‌شوند؛ نمونهٔ الگو:
-- CREATE TABLE enrollments (...) PARTITION BY RANGE ("termId");
-- CREATE TABLE enrollments_14051 PARTITION OF enrollments FOR VALUES FROM (2) TO (3);

-- ③ امنیت سطح-ردیف — RLS (سند §۲۱۷۰): حتی با بایپس کد، دیتای دیگران خوانده نمی‌شود
-- نسخهٔ ۲ (سخت): سیاست‌ها فقط با «app.user_id» تنظیم‌شده در همان تراکنش پاس می‌شوند.
-- نقش اپلیکیشنِ فقط-خواندنی afagh_app (بدون SUPERUSER → تابعیت کامل از RLS)؛
-- نقش مالک (afagh) برای مهاجرت/داشبورد مدیریتی و نوشتن ثبت‌نام‌ها می‌ماند.

-- ── نقش اپلیکیشن (idempotent) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afagh_app') THEN
    CREATE ROLE afagh_app LOGIN PASSWORD 'afagh_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT CONNECT ON DATABASE afagh_db TO afagh_app;
GRANT USAGE ON SCHEMA public TO afagh_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO afagh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO afagh_app;

-- ── فعال‌سازی RLS (بدون این، سیاست‌ها بی‌اثرند!) ──
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_requests" ENABLE ROW LEVEL SECURITY;

-- ── سیاست‌های سختِ خواندن (uid = app.user_id همان تراکنش؛ نبود → هیچ ردیفی) ──
DROP POLICY IF EXISTS enroll_self_read ON "enrollments";
CREATE POLICY enroll_self_read ON "enrollments" FOR SELECT USING (
  "studentId" IN (SELECT "id" FROM "students"
                  WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int)
);
DROP POLICY IF EXISTS cart_self_read ON "cart_items";
CREATE POLICY cart_self_read ON "cart_items" FOR SELECT USING (
  "studentId" IN (SELECT "id" FROM "students"
                  WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int)
);
DROP POLICY IF EXISTS notif_self_read ON "notifications";
CREATE POLICY notif_self_read ON "notifications" FOR SELECT USING (
  "userId" = nullif(current_setting('app.user_id', true), '')::int
);
DROP POLICY IF EXISTS request_self_read ON "student_requests";
CREATE POLICY request_self_read ON "student_requests" FOR SELECT USING (
  "studentId" IN (SELECT "id" FROM "students"
                  WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int)
);
-- ── نسخهٔ ۳: نوشتن تحت RLS — دانشجو فقط ردیف‌های خودش را می‌نویسد ──
-- (شمارنده‌های مشترک مثل enrolledCount و ارتقای لیست انتظارِ «دیگری» از نقش
--  مالک اجرا می‌شوند — اقدام سیستم، نه اقدام دانشجو)
GRANT INSERT, DELETE ON "cart_items" TO afagh_app;
GRANT INSERT, UPDATE ON "enrollments" TO afagh_app;
GRANT INSERT, UPDATE ON "student_requests" TO afagh_app;
GRANT INSERT ON "notifications" TO afagh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO afagh_app;   -- serialها برای INSERT

DROP POLICY IF EXISTS cart_self_ins ON "cart_items";
CREATE POLICY cart_self_ins ON "cart_items" FOR INSERT TO afagh_app
  WITH CHECK ("studentId" IN (SELECT "id" FROM "students"
                              WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));
DROP POLICY IF EXISTS cart_self_del ON "cart_items";
CREATE POLICY cart_self_del ON "cart_items" FOR DELETE TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
                         WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS enroll_self_ins ON "enrollments";
CREATE POLICY enroll_self_ins ON "enrollments" FOR INSERT TO afagh_app
  WITH CHECK ("studentId" IN (SELECT "id" FROM "students"
                              WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));
DROP POLICY IF EXISTS enroll_self_upd ON "enrollments";
CREATE POLICY enroll_self_upd ON "enrollments" FOR UPDATE TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
                         WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int))
  WITH CHECK ("studentId" IN (SELECT "id" FROM "students"
                              WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS request_self_ins ON "student_requests";
CREATE POLICY request_self_ins ON "student_requests" FOR INSERT TO afagh_app
  WITH CHECK ("studentId" IN (SELECT "id" FROM "students"
                              WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));
DROP POLICY IF EXISTS request_self_upd ON "student_requests";
CREATE POLICY request_self_upd ON "student_requests" FOR UPDATE TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
                         WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS notif_self_ins ON "notifications";
CREATE POLICY notif_self_ins ON "notifications" FOR INSERT TO afagh_app
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), '')::int);

-- الگوی استفاده در اپ: db.transaction → set_config('app.user_id', <uid>, true) → کوئری‌های خواندن
-- (set_config با is_local=true فقط در همان تراکنش می‌ماند — امن در استخر اتصال)

-- ④ آرشیو سرد (سند §۲۱۰۲): انتقال ترم‌های قدیمی به دیتابیس ارزان‌تر
--    INSERT INTO archive_db.enrollments SELECT * FROM enrollments WHERE "termId" < ...;
--    DELETE FROM enrollments WHERE ...;

-- ⑤ نگهداشت: VACUUM FULL در ساعات کم‌ترافیک + حذف ایندکس‌های بدون استفاده (سند §۲۱۳۰)
-- cron: 0 3 * * 6  psql -c 'VACUUM (ANALYZE, VERBOSE);'

-- ⑥ قیدهای یکتایی که در schema.ts تعریف شده‌اند
--    `drizzle-kit push` این قیدهای نام‌دار را همیشه نمی‌سازد، ولی کد اپ در چند
--    مسیر (ثبت درس تطبیق‌شده، کانال‌های اعلان) به `ON CONFLICT` روی همین ستون‌ها
--    تکیه می‌کند؛ نبودِ قید = خطای 42P10 در زمان اجرا. اینجا idempotent ساخته
--    می‌شوند و پیش از آن، ردیفهای تکراریِ احتمالی پاک می‌شوند.
DELETE FROM "enrollments" a USING "enrollments" b
 WHERE a.id > b.id AND a."studentId" = b."studentId" AND a."offeringId" = b."offeringId";
ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "uq_enrollments";
ALTER TABLE "enrollments" ADD CONSTRAINT "uq_enrollments" UNIQUE ("studentId", "offeringId");

DELETE FROM "notification_channels" a USING "notification_channels" b
 WHERE a.id > b.id AND a."userId" = b."userId" AND a.channel = b.channel;
ALTER TABLE "notification_channels" DROP CONSTRAINT IF EXISTS "uq_notification_channels";
ALTER TABLE "notification_channels" ADD CONSTRAINT "uq_notification_channels" UNIQUE ("userId", channel);

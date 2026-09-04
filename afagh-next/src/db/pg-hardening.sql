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

-- ③ امنیت سطح-ردیف — RLS (سند §۲۱۷۰) — نسخهٔ ۳: ماتریس کامل داده‌های حساس
-- ════════════════════════════════════════════════════════════════════════
--  اصول (پاسخ به بازبینی مهندسی — «RLS فقط چهار جدول» دیگر کافی نیست):
--   • نقش afagh_app فقط از مسیر withUserRls استفاده می‌شود (set_config در همان
--     تراکنش)؛ نبودِ app.user_id → هیچ ردیفی دیده نمی‌شود.
--   • هر جدول دادهٔ شخصی/مالی/آموزشی → RLS فعال + سیاست «فقط ردیف خود کاربر».
--   • جداول دارای راز/بایگانی (system_settings با کلیدهای cron، integrations_config
--     با اعتبارنامه‌ها، audit_logs و…) → RLS فعال بدون سیاست = deny-all برای نقش اپ.
--   • نوشتن فقط با گرنت ستونی: دانشجو می‌تواند status و waitlistPosition را تغییر
--     دهد، اما نه gradeValue/approvedBy/… → Mass Assignment در سطح دیتابیس قفل شد.
--   • مالک (afagh) BYPASSRLS است؛ داشبوردهای مدیریتی/BI بدون تغییر کار می‌کنند.
-- ════════════════════════════════════════════════════════════════════════

-- ── نقش اپلیکیشن (idempotent) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afagh_app') THEN
    CREATE ROLE afagh_app LOGIN PASSWORD '__AFAGH_APP_PASSWORD__' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT CONNECT ON DATABASE afagh_db TO afagh_app;
GRANT USAGE ON SCHEMA public TO afagh_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO afagh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO afagh_app;

-- ══ ۱) فعال‌سازی RLS روی همهٔ جداول دادهٔ حساس ══
--    (بدون ENABLE، سیاست‌ها بی‌اثرند؛ لیست بر اساس ماتریس طبقه‌بندی داده)
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcript_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_clearances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seat_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_class_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "military_service_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_appeals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_submission_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_sign_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professor_term_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professor_class_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "professor_exam_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "electronic_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_minutes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "physical_access_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_step_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_parallel_checkpoints" ENABLE ROW LEVEL SECURITY;

-- ══ ۲) deny-all: جداول راز/بایگانی — RLS بدون سیاست + REVOKE صریح ══
--    app role هرگز نباید این‌ها را ببیند (کلیدهای cron، اعتبارنامه‌ها، لاگ‌ها،
--    دادهٔ خام پذیرش، پاسخ‌های ارزشیابی بدون کلید کاربر).
REVOKE SELECT ON "system_settings", "integrations_config", "audit_logs", "api_audit_logs",
             "admissions_staging", "sanjesh_mappings", "evaluation_responses",
             "verification_otps", "step_api_actions", "document_signatures",
             "curriculum_approvals"
  FROM afagh_app;
ALTER TABLE "system_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integrations_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admissions_staging" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sanjesh_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evaluation_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "step_api_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_signatures" ENABLE ROW LEVEL SECURITY;
-- چرخهٔ تأیید برنامهٔ درسی: دفتر ممیزیِ فقط-مالک (بدون سیاست = deny-all برای نقش اپ)
ALTER TABLE "curriculum_approvals" ENABLE ROW LEVEL SECURITY;

-- ══ ۳) سیاست‌های خواندن (SELECT) — تعریف مشترک uid ══
-- uid = nullif(current_setting('app.user_id', true), '')::int
--    (نبودِ تنظیم → NULL → استفاده در مقایسه FALSE → صفر ردیف)

DROP POLICY IF EXISTS users_self_read ON "users";
CREATE POLICY users_self_read ON "users" FOR SELECT TO afagh_app
  USING ("id" = nullif(current_setting('app.user_id', true), '')::int);

DROP POLICY IF EXISTS students_self_read ON "students";
CREATE POLICY students_self_read ON "students" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

DROP POLICY IF EXISTS staff_self_read ON "staff";
CREATE POLICY staff_self_read ON "staff" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

DROP POLICY IF EXISTS sessions_self_read ON "sessions";
CREATE POLICY sessions_self_read ON "sessions" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

-- (الگوی مشترک: سطرهای دانشجویی → از طریق students؛ سطرهای کارکنان → از طریق staff)
DROP POLICY IF EXISTS transcript_self_read ON "transcript_snapshots";
CREATE POLICY transcript_self_read ON "transcript_snapshots" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS ledger_self_read ON "student_ledger";
CREATE POLICY ledger_self_read ON "student_ledger" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS clearance_self_read ON "financial_clearances";
CREATE POLICY clearance_self_read ON "financial_clearances" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS seat_self_read ON "seat_allocations";
CREATE POLICY seat_self_read ON "seat_allocations" FOR SELECT TO afagh_app
  USING ("enrollmentId" IN (SELECT e."id" FROM "enrollments" e
    JOIN "students" s ON s."id" = e."studentId"
    WHERE s."userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS attendance_self_read ON "student_class_attendance";
CREATE POLICY attendance_self_read ON "student_class_attendance" FOR SELECT TO afagh_app
  USING ("enrollmentId" IN (SELECT e."id" FROM "enrollments" e
    JOIN "students" s ON s."id" = e."studentId"
    WHERE s."userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS doc_self_read ON "student_documents";
CREATE POLICY doc_self_read ON "student_documents" FOR SELECT TO afagh_app
  USING ("personUserId" = nullif(current_setting('app.user_id', true), '')::int);

DROP POLICY IF EXISTS military_self_read ON "military_service_records";
CREATE POLICY military_self_read ON "military_service_records" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS kyc_self_read ON "kyc_verifications";
CREATE POLICY kyc_self_read ON "kyc_verifications" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

DROP POLICY IF EXISTS appeal_self_read ON "grade_appeals";
CREATE POLICY appeal_self_read ON "grade_appeals" FOR SELECT TO afagh_app
  USING ("enrollmentId" IN (SELECT e."id" FROM "enrollments" e
    JOIN "students" s ON s."id" = e."studentId"
    WHERE s."userId" = nullif(current_setting('app.user_id', true), '')::int));

-- ── کارکنان: ردیف‌های مرتبط با خودشان ──
DROP POLICY IF EXISTS gsotp_self_read ON "grade_submission_otps";
CREATE POLICY gsotp_self_read ON "grade_submission_otps" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS dsotp_self_read ON "doc_sign_otps";
CREATE POLICY dsotp_self_read ON "doc_sign_otps" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS contract_self_read ON "professor_term_contracts";
CREATE POLICY contract_self_read ON "professor_term_contracts" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS pclass_self_read ON "professor_class_attendance";
CREATE POLICY pclass_self_read ON "professor_class_attendance" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS pexam_self_read ON "professor_exam_attendance";
CREATE POLICY pexam_self_read ON "professor_exam_attendance" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS edoc_self_read ON "electronic_documents";
CREATE POLICY edoc_self_read ON "electronic_documents" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS payroll_self_read ON "payroll_statements";
CREATE POLICY payroll_self_read ON "payroll_statements" FOR SELECT TO afagh_app
  USING ("contractId" IN (SELECT c."id" FROM "professor_term_contracts" c
    JOIN "staff" st ON st."id" = c."staffId"
    WHERE st."userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS minutes_self_read ON "exam_minutes";
CREATE POLICY minutes_self_read ON "exam_minutes" FOR SELECT TO afagh_app
  USING ("supervisorStaffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS accesslog_self_read ON "physical_access_logs";
CREATE POLICY accesslog_self_read ON "physical_access_logs" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff"
    WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS reqlog_self_read ON "request_step_logs";
CREATE POLICY reqlog_self_read ON "request_step_logs" FOR SELECT TO afagh_app
  USING ("requestId" IN (SELECT r."id" FROM "student_requests" r
    JOIN "students" s ON s."id" = r."studentId"
    WHERE s."userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS checkpoint_self_read ON "request_parallel_checkpoints";
CREATE POLICY checkpoint_self_read ON "request_parallel_checkpoints" FOR SELECT TO afagh_app
  USING ("requestId" IN (SELECT r."id" FROM "student_requests" r
    JOIN "students" s ON s."id" = r."studentId"
    WHERE s."userId" = nullif(current_setting('app.user_id', true), '')::int));

-- ══ ۴) نوشتن تحت RLS: سیاست‌ها + گرنت ستونی (ضد Mass Assignment) ══
-- دانشجو فقط این ستون‌ها را می‌تواند عوض کند؛ gradeValue/approvedBy/financial…
-- از نقش اپ غیرقابل نوشتن‌اند (گرنت ستونی + سیاست ردیف).
GRANT INSERT ON "enrollments" TO afagh_app;
GRANT UPDATE ("status", "waitlistPosition") ON "enrollments" TO afagh_app;
GRANT INSERT, DELETE ON "cart_items" TO afagh_app;
GRANT INSERT ON "notifications" TO afagh_app;
-- student_requests: هیچ مسیری از نقش اپ نمی‌نویسد (همه از نقش مالک) → revoke
REVOKE INSERT, UPDATE ON "student_requests" FROM afagh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO afagh_app;   -- serialها برای INSERT

DROP POLICY IF EXISTS enroll_self_read ON "enrollments";
CREATE POLICY enroll_self_read ON "enrollments" FOR SELECT TO afagh_app USING (
  "studentId" IN (SELECT "id" FROM "students"
                  WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int)
);
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

DROP POLICY IF EXISTS cart_self_read ON "cart_items";
CREATE POLICY cart_self_read ON "cart_items" FOR SELECT TO afagh_app USING (
  "studentId" IN (SELECT "id" FROM "students"
                  WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int)
);
DROP POLICY IF EXISTS cart_self_ins ON "cart_items";
CREATE POLICY cart_self_ins ON "cart_items" FOR INSERT TO afagh_app
  WITH CHECK ("studentId" IN (SELECT "id" FROM "students"
                              WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));
DROP POLICY IF EXISTS cart_self_del ON "cart_items";
CREATE POLICY cart_self_del ON "cart_items" FOR DELETE TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students"
                         WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

DROP POLICY IF EXISTS notif_self_read ON "notifications";
CREATE POLICY notif_self_read ON "notifications" FOR SELECT TO afagh_app USING (
  "userId" = nullif(current_setting('app.user_id', true), '')::int
);
DROP POLICY IF EXISTS notif_self_ins ON "notifications";
CREATE POLICY notif_self_ins ON "notifications" FOR INSERT TO afagh_app
  WITH CHECK ("userId" = nullif(current_setting('app.user_id', true), '')::int);

DROP POLICY IF EXISTS request_self_read ON "student_requests";
CREATE POLICY request_self_read ON "student_requests" FOR SELECT TO afagh_app USING (
  "studentId" IN (SELECT "id" FROM "students"
                  WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int)
);

-- الگوی استفاده در اپ: appDb.transaction → set_config('app.user_id', <uid>, true) → کوئری
-- (set_config با is_local=true فقط در همان تراکنش می‌ماند — امن در استخر اتصال؛
--  گسترش مسیرهای خواندنِ دانشجو/استاد به باUserRls گام بعدی است — فعلاً نوشتن‌ها تحت RLS و
--  خواندن‌ها با اسکوپ صریح در لایهٔ اپ + این آزمون‌های CI)

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

-- ⑦ ایندکس‌های گزارش‌های هوش تجاری (BI)
--    موتور bi-engine روی «همهٔ پاسخ‌ها × همهٔ اساتید/کلاس‌ها» کوئری تجمیعی
--    می‌زند (GROUP BY)؛ بدون این ایندکس‌ها هر بار Seq Scan روی
--    evaluation_responses و schedules انجام می‌شود. idempotent هستند.
CREATE INDEX IF NOT EXISTS "idx_eval_resp_period_offering" ON "evaluation_responses" ("periodId", "offeringId");
CREATE INDEX IF NOT EXISTS "idx_eval_resp_question"        ON "evaluation_responses" ("questionId");
CREATE INDEX IF NOT EXISTS "idx_eval_resp_offering"        ON "evaluation_responses" ("offeringId");
CREATE INDEX IF NOT EXISTS "idx_eval_q_form_axis"          ON "evaluation_questions" ("formId", "axisLabel");
CREATE INDEX IF NOT EXISTS "idx_schedules_room_type"       ON "schedules" ("roomId", "scheduleType");
CREATE INDEX IF NOT EXISTS "idx_offering_prof_role"        ON "offering_professors" ("role", "staffId");
CREATE INDEX IF NOT EXISTS "idx_analytics_snapshots_type"  ON "analytics_snapshots" ("reportType");


-- ════════════════════════════════════════════════════════════════════════
--  ⑧ تکمیل پوشش RLS — ۲۱ جدول هویتی/مالی باقی‌مانده (بازبینی ۴)
--
--  ماتریس اولیه ۳۸ جدول را پوشش می‌داد؛ این جدول‌ها بعداً به اسکیما اضافه
--  شدند و بدون RLS بودند → نقش اپ (afagh_app) می‌توانست کل ستون‌های آن‌ها را
--  بدون محدودیت بخواند. اینجا برای هر یک: ENABLE ROW LEVEL SECURITY + پالیسی
--  self-read (همان الگوی بخش ③). جدول‌های بدون مالکیت مشخص (legacy_code_maps)
--  با deny-all صریح بسته می‌شوند. همهٔ دستورها idempotent‌اند.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE "payment_cheques" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_cheques_self_read ON "payment_cheques";
CREATE POLICY payment_cheques_self_read ON "payment_cheques" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "student_discounts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_discounts_self_read ON "student_discounts";
CREATE POLICY student_discounts_self_read ON "student_discounts" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "student_sponsorships" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_sponsorships_self_read ON "student_sponsorships";
CREATE POLICY student_sponsorships_self_read ON "student_sponsorships" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "student_loans" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_loans_self_read ON "student_loans";
CREATE POLICY student_loans_self_read ON "student_loans" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "student_cards" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_cards_self_read ON "student_cards";
CREATE POLICY student_cards_self_read ON "student_cards" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "clearance_checklist" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clearance_checklist_self_read ON "clearance_checklist";
CREATE POLICY clearance_checklist_self_read ON "clearance_checklist" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "issued_degrees" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS issued_degrees_self_read ON "issued_degrees";
CREATE POLICY issued_degrees_self_read ON "issued_degrees" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "exam_attendances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_attendances_self_read ON "exam_attendances";
CREATE POLICY exam_attendances_self_read ON "exam_attendances" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "graduation_audits" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graduation_audits_self_read ON "graduation_audits";
CREATE POLICY graduation_audits_self_read ON "graduation_audits" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "alumni_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alumni_profiles_self_read ON "alumni_profiles";
CREATE POLICY alumni_profiles_self_read ON "alumni_profiles" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "alumni_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alumni_requests_self_read ON "alumni_requests";
CREATE POLICY alumni_requests_self_read ON "alumni_requests" FOR SELECT TO afagh_app
  USING ("studentId" IN (SELECT "id" FROM "students" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "exam_invigilators" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_invigilators_self_read ON "exam_invigilators";
CREATE POLICY exam_invigilators_self_read ON "exam_invigilators" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "invigilators" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invigilators_self_read ON "invigilators";
CREATE POLICY invigilators_self_read ON "invigilators" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "offering_professors" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offering_professors_self_read ON "offering_professors";
CREATE POLICY offering_professors_self_read ON "offering_professors" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "professor_availabilities" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS professor_availabilities_self_read ON "professor_availabilities";
CREATE POLICY professor_availabilities_self_read ON "professor_availabilities" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "staff_roles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_roles_self_read ON "staff_roles";
CREATE POLICY staff_roles_self_read ON "staff_roles" FOR SELECT TO afagh_app
  USING ("staffId" IN (SELECT "id" FROM "staff" WHERE "userId" = nullif(current_setting('app.user_id', true), '')::int));

ALTER TABLE "notification_channels" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_channels_self_read ON "notification_channels";
CREATE POLICY notification_channels_self_read ON "notification_channels" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_deliveries_self_read ON "notification_deliveries";
CREATE POLICY notification_deliveries_self_read ON "notification_deliveries" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_logs_self_read ON "notification_logs";
CREATE POLICY notification_logs_self_read ON "notification_logs" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_self_read ON "user_roles";
CREATE POLICY user_roles_self_read ON "user_roles" FOR SELECT TO afagh_app
  USING ("userId" = nullif(current_setting('app.user_id', true), '')::int);

ALTER TABLE "legacy_code_maps" ENABLE ROW LEVEL SECURITY;
-- targetId عمومی/داخلی است و کاربرد نقش اپ ندارد → برای نقش اپ «هیچ» (deny-all صریح)
DROP POLICY IF EXISTS legacy_code_maps_deny_all ON "legacy_code_maps";
CREATE POLICY legacy_code_maps_deny_all ON "legacy_code_maps" FOR ALL TO afagh_app USING (false);

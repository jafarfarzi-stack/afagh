-- ══════════════════════════════════════════════════════════════════════
-- 0065 — کد دانشگاه در همهٔ جدول‌های مهم
--
-- چرا؟ سامانه چنددانشگاهی است؛ هویت هر ردیفِ دادهٔ کسب‌وکار باید
-- «(universityId + کلید)» باشد، نه فقط کلید — چون کد دانشجو/درس/ترم بین
-- دانشگاه‌ها تکراری است. این مهاجرت ستون universityId را به جدول‌های
-- مهمِ داده‌دار که نداشتند اضافه می‌کند و برای ردیف‌های موجود از طریق
-- کاربر/استاد/ارائهٔ مرتبط backfill می‌کند.
--
-- جدول‌های جهانی (roles، permissions، geo_*، universities، sessions …)
-- عمداً دست نمی‌خورند؛ آن‌ها بین دانشگاه‌ها مشترک‌اند.
-- اجرای مجدد بی‌خطر (IF NOT EXISTS). ستون nullable نگه داشته می‌شود.
-- ═════════════════════════════════════════════════════━━━━━━━━━━━━━━━━

--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "messenger_link_tokens" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "evaluation_responses" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "lesson_plan_sessions" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "lesson_plan_weights" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "staff_roles" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "staff_term_roles" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "signature_otps" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "doc_sign_otps" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "workflow_events" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "payroll_approvals" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "integrations_config" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "api_audit_logs" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "professor_availability_notes" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "tuition_compare_runs" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "tuition_compare_items" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
-- جدول‌های مهاجرت مالی (منبع حقیقتِ تبدیل — حتماً باید دانشگاه داشته باشند)
ALTER TABLE "legacy_grades" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "legacy_financial_records" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "legacy_code_maps" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");
--> statement-breakpoint
ALTER TABLE "legacy_tuition_formulas" ADD COLUMN IF NOT EXISTS "universityId" integer REFERENCES "universities"("id");

-- ═══════════ backfill ردیف‌های موجود ═══════════
--> statement-breakpoint
UPDATE "notifications" n SET "universityId" = u."universityId" FROM "users" u WHERE n."userId" = u."id" AND n."universityId" IS NULL;
--> statement-breakpoint
UPDATE "notification_deliveries" nd SET "universityId" = u."universityId" FROM "users" u WHERE nd."userId" = u."id" AND nd."universityId" IS NULL;
--> statement-breakpoint
UPDATE "notification_channels" nc SET "universityId" = u."universityId" FROM "users" u WHERE nc."userId" = u."id" AND nc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "messenger_link_tokens" mlt SET "universityId" = u."universityId" FROM "users" u WHERE mlt."userId" = u."id" AND mlt."universityId" IS NULL;
--> statement-breakpoint
UPDATE "evaluation_responses" er SET "universityId" = co."universityId" FROM "course_offerings" co WHERE er."offeringId" = co."id" AND er."universityId" IS NULL;
--> statement-breakpoint
UPDATE "lesson_plans" lp SET "universityId" = co."universityId" FROM "course_offerings" co WHERE lp."offeringId" = co."id" AND lp."universityId" IS NULL;
--> statement-breakpoint
UPDATE "staff_roles" sr SET "universityId" = st."universityId" FROM "staff" st WHERE sr."staffId" = st."id" AND sr."universityId" IS NULL;
--> statement-breakpoint
UPDATE "staff_term_roles" str SET "universityId" = st."universityId" FROM "staff" st WHERE str."staffId" = st."id" AND str."universityId" IS NULL;
--> statement-breakpoint
UPDATE "signature_otps" so SET "universityId" = st."universityId" FROM "staff" st WHERE so."staffId" = st."id" AND so."universityId" IS NULL;
--> statement-breakpoint
UPDATE "professor_availability_notes" pan SET "universityId" = st."universityId" FROM "staff" st WHERE pan."staffId" = st."id" AND pan."universityId" IS NULL;

-- ═══════════ نمایهٔ پرس‌وجوی مرتبط ═══════════
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_notifications_uni ON "notifications"("universityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_notif_deliv_uni ON "notification_deliveries"("universityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_lesson_plans_uni ON "lesson_plans"("universityId");
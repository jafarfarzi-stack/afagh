-- 0060_makeup_session_fields.sql
-- کارتابل واقعی کلاس جبرانی: اتاق، مبحث، علت غیبت و دلیل رد روی class_sessions.
-- تا امروز این‌ها فقط در حافظهٔ مرورگر بودند (کارت هاردکد) یا دور ریخته می‌شدند.
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "roomId" integer REFERENCES "classrooms"("id");
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "topic" varchar(300);
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "absenceReason" text;
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "rejectionReason" text;
CREATE INDEX IF NOT EXISTS "idx_class_sessions_makeup_status" ON "class_sessions" ("isMakeUpSession", "status");

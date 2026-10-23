-- ۰۱۱۰: ثبتِ «بررسی/پذیرش» تداخل‌های واقعی برنامهٔ هفتگی
-- idempotent: اجرای چندباره بی‌خطر است.
--
-- چرا این جدول؟ ترم ۱۴۰۵۱ نشان داد شمارشِ خامِ هم‌پوشانی‌ها (۷۱۶ مورد) با
-- تداخلِ واقعی (۶۹ مورد) فرق دارد: بیشترِ موارد کلاس ادغامی‌اند. کارشناس
-- آموزش باید بتواند باقی‌مانده را «بررسی و پذیرش» کند تا هفتهٔ بعد دوباره
-- به‌عنوان خطای تازه بالا نیایند — بدون اینکه برنامه واقعاً تغییر کند.
-- پس اینجا فقط *وضعیت بررسی* ذخیره می‌شود؛ رفعِ واقعی یا با اصلاحِ برنامه
-- (schedules) است یا با تعیین کلید ادغام (course_offerings."sharedScheduleGroupKey").

CREATE TABLE IF NOT EXISTS "schedule_conflict_reviews" (
  "id" serial PRIMARY KEY,
  "termId" integer NOT NULL REFERENCES "academic_terms"("id") ON DELETE CASCADE,
  "universityId" integer REFERENCES "universities"("id"),
  "kind" varchar(20) NOT NULL,                -- PROFESSOR | ROOM
  "entityId" integer NOT NULL,                -- staff.id یا classrooms.id
  "dayOfWeek" integer NOT NULL,
  "scheduleAId" integer NOT NULL REFERENCES "schedules"("id") ON DELETE CASCADE,
  "scheduleBId" integer NOT NULL REFERENCES "schedules"("id") ON DELETE CASCADE,
  -- اثرانگشتِ پایدار: kind:entityId:day:min(scheduleId):max(scheduleId)
  "fingerprint" varchar(120) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'REVIEWED',   -- REVIEWED | RESOLVED
  "reasonCode" varchar(40),
  "reasonText" text,
  "reviewedByUserId" integer REFERENCES "users"("id"),
  "reviewedAt" timestamp DEFAULT now(),
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sconflict_term" ON "schedule_conflict_reviews" ("termId");
CREATE INDEX IF NOT EXISTS "idx_sconflict_entity" ON "schedule_conflict_reviews" ("kind", "entityId");
-- یک رای برای هر تداخل در هر ترم (دوبار ذخیره‌کردن، ردیف تکراری نمی‌سازد)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sconflict_term_fp"
  ON "schedule_conflict_reviews" ("termId", "fingerprint");

-- RLS (پوشش کامل migrator): جدول دارای reviewedByUserId است
ALTER TABLE "schedule_conflict_reviews" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sconflict_app_access ON "schedule_conflict_reviews";
CREATE POLICY sconflict_app_access ON "schedule_conflict_reviews" FOR ALL TO afagh_app
  USING (nullif(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (nullif(current_setting('app.user_id', true), '') IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON "schedule_conflict_reviews" TO afagh_app;

-- تخصیص کارشناس آموزش به «اتاق» (کلاس فیزیکی) — مدلِ درست‌ترِ مسئولیت.
--
-- چرا: کارشناس آموزش مسئولِ یک فضای فیزیکی است، نه ۱۳۴۵ سطرِ درس. در ترمِ ۱۱۱،
-- ۱۳۴۵ ارائه سانس دارند ولی فقط در ۴۹ اتاق برگزار می‌شوند؛ پس واحدِ تخصیص از
-- «ارائه» به «اتاق» کوچک می‌شود (۲۷ برابر کمتر) و با جابه‌جاییِ برنامه خودکار
-- به‌روز می‌ماند.
--
-- زنجیرهٔ تصمیم (از دقیق به کلی):
--   ۱) `course_offering_edu_experts`  → استثنای همان درس/گروه (مهاجرت ۰۱۱۱)
--   ۲) همین جدول                      → کارشناسِ اتاقِ همان سانس
--   ۳) `expert_scopes`                → گروه/دانشکده/دانشگاه
--
-- چند کارشناس برای یک اتاق مجاز است (همان الگوی جدولِ واسط).

CREATE TABLE IF NOT EXISTS "classroom_edu_experts" (
  "id" serial PRIMARY KEY,
  "classroomId" integer NOT NULL REFERENCES "classrooms"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- یک کارشناس برای یک اتاق فقط یک بار
CREATE UNIQUE INDEX IF NOT EXISTS "uq_classroom_edu_experts_room_user"
  ON "classroom_edu_experts" ("classroomId", "userId");

-- کارتابل «اتاق‌های من» برای کارشناس
CREATE INDEX IF NOT EXISTS "idx_classroom_edu_experts_user"
  ON "classroom_edu_experts" ("userId");

-- هم‌ترازی با سخت‌سازیِ امنیتی (scripts/hardening.mjs) تا دامپِ afagh_backup
-- این جدولِ تازه را جا نیندازد. اگر نقش وجود نداشته باشد بی‌صدا رد می‌شود.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afagh_backup') THEN
    EXECUTE 'GRANT SELECT, INSERT, TRUNCATE ON "classroom_edu_experts" TO afagh_backup';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'classroom_edu_experts'
        AND policyname = 'afagh_backup_read'
    ) THEN
      EXECUTE 'CREATE POLICY afagh_backup_read ON "classroom_edu_experts" FOR SELECT TO afagh_backup USING (true)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'classroom_edu_experts'
        AND policyname = 'afagh_backup_insert'
    ) THEN
      EXECUTE 'CREATE POLICY afagh_backup_insert ON "classroom_edu_experts" FOR INSERT TO afagh_backup WITH CHECK (true)';
    END IF;
  END IF;
END $do$;

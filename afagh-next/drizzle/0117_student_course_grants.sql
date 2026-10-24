-- ۰۱۱۷: تخصیص صریحِ «درس ترم بالاتر» توسط مدیر گروه
-- idempotent: اجرای چندباره بی‌خطر است.
--
-- چرا این جدول؟ قانون چارت در انتخاب واحد: دانشجو درسِ ترم جاری و ترم‌های
-- *پایین‌ترِ* خودش را می‌بیند، ولی درسِ ترم‌های *بالاتر* فقط وقتی نمایان می‌شود
-- که مدیر گروه آن را برای او تخصیص داده باشد (مثلاً دانشجوی ترم ۵ که برای
-- جبرانی باید درس ترم ۶ را بگیرد). این جدول همان تخصیص را ثبت می‌کند.
--
-- دامنهٔ داده: هر ردیف = یک (دانشجو، درسِ داخلِ چارتِ خودش). یکتایی روی
-- این جفت تضمین می‌کند تخصیص تکراری ساخته نشود. حذف دانشجو/درس → ردیف هم
-- پاک می‌شود (CASCADE) تا تخصیص یتیم نماند.

CREATE TABLE IF NOT EXISTS "student_course_grants" (
  "id" serial PRIMARY KEY,
  "studentId" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "courseId" integer NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  -- چارت مرجعی که تخصیص در چارتان انجام شده (برای ممیزی؛ اگر نسخه حذف شد NULL می‌شود)
  "curriculumVersionId" integer REFERENCES "curriculum_versions"("id") ON DELETE SET NULL,
  -- شمارهٔ ترمِ پیشنهادیِ همین درس در چارت (برای نمایش «چرا بالاتر است»)
  "termOrdinal" integer,
  "reason" text,
  "grantedByStaffId" integer REFERENCES "staff"("id") ON DELETE SET NULL,
  "grantedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_course_grants_student_course"
  ON "student_course_grants" ("studentId", "courseId");
CREATE INDEX IF NOT EXISTS "idx_scg_student" ON "student_course_grants" ("studentId");
CREATE INDEX IF NOT EXISTS "idx_scg_course" ON "student_course_grants" ("courseId");

-- ═══ RLS (پوشش کامل migrator: جدول دارای studentId است) ═══
-- دانشجو فقط تخصیص‌های *خودش* را می‌خواند (صفحهٔ انتخاب واحد).
ALTER TABLE "student_course_grants" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scg_student_self_read ON "student_course_grants";
CREATE POLICY scg_student_self_read ON "student_course_grants" FOR SELECT TO afagh_app
  USING ("studentId" IN (
    SELECT s."id" FROM students s
    WHERE s."userId" = nullif(current_setting('app.user_id', true), '')::int
  ));

-- کارمند (مدیر گروه) همهٔ تخصیص‌ها را می‌بیند (پنل مدیریت). کنترل نقشِ DEP_HEAD
-- و دامنهٔ گروه در لایهٔ اپ انجام می‌شود؛ RLS فقط نشتِ داده به نقش اپ را می‌بندد.
DROP POLICY IF EXISTS scg_staff_read ON "student_course_grants";
CREATE POLICY scg_staff_read ON "student_course_grants" FOR SELECT TO afagh_app
  USING (EXISTS (
    SELECT 1 FROM staff st
    WHERE st."userId" = nullif(current_setting('app.user_id', true), '')::int
  ));

-- نوشتن/حذف فقط با پروندهٔ کارمندی — دانشجو نمی‌تواند برای خودش تخصیاص بسازد.
DROP POLICY IF EXISTS scg_staff_insert ON "student_course_grants";
CREATE POLICY scg_staff_insert ON "student_course_grants" FOR INSERT TO afagh_app
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff st
    WHERE st."userId" = nullif(current_setting('app.user_id', true), '')::int
  ));

DROP POLICY IF EXISTS scg_staff_update ON "student_course_grants";
CREATE POLICY scg_staff_update ON "student_course_grants" FOR UPDATE TO afagh_app
  USING (EXISTS (
    SELECT 1 FROM staff st
    WHERE st."userId" = nullif(current_setting('app.user_id', true), '')::int
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff st
    WHERE st."userId" = nullif(current_setting('app.user_id', true), '')::int
  ));

DROP POLICY IF EXISTS scg_staff_delete ON "student_course_grants";
CREATE POLICY scg_staff_delete ON "student_course_grants" FOR DELETE TO afagh_app
  USING (EXISTS (
    SELECT 1 FROM staff st
    WHERE st."userId" = nullif(current_setting('app.user_id', true), '')::int
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON "student_course_grants" TO afagh_app;
GRANT USAGE, SELECT ON SEQUENCE "student_course_grants_id_seq" TO afagh_app;

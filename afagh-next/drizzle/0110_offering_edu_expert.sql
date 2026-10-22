-- تخصیص کارشناس آموزش در سطحِ کلاس (تعریف کلاس).
-- NULL یعنی تخصیص در سطح کلاس نشده و از expert_scopes (تخصیص نقش‌ها) پایین می‌آید.
-- مرجع به users.id است چون کارشناس یک حساب کاربری دارد (نه رکورد staff جدا).

ALTER TABLE "course_offerings"
  ADD COLUMN IF NOT EXISTS "eduExpertUserId" integer REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_course_offerings_edu_expert"
  ON "course_offerings" ("eduExpertUserId");

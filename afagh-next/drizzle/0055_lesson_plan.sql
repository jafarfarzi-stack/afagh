-- ════════════════════════════════════════════════════════════════════════
-- 0055 — ماژول اختیاری «طرح درس» (Lesson-Plan)
-- ────────────────────────────────────────────────────────────────────────
--  چهار جدول دانشگاه-ناآگاه (فقط FK به course_offerings/universities):
--    lesson_plans (سرجمع هر ارائه) · lesson_plan_weights (بارم‌بندی درصدی
--    همین ماژول — مستقل از بارم /۲۰ سمت‌کاربرِ صفحهٔ نمرات) ·
--    lesson_plan_sessions (جلسات ۱..N) · lesson_plan_settings (اجباری‌بودن
--    به‌ازای هر دانشگاه + اطلاعیه — فقط بنر/فشار ثبت، نه سدّ فنی).
--  ▸ idempotent: IF NOT EXISTS همه‌جا (جدول‌ها + ایندکس‌ها).
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "offeringId" integer NOT NULL UNIQUE,
  "courseMode" varchar(10) NOT NULL DEFAULT 'THEORY',
  "totalSessions" integer NOT NULL DEFAULT 16,
  "objectives" text,
  "resources" text,
  "status" varchar(12) DEFAULT 'DRAFT',
  "submittedAt" timestamp,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "lesson_plans_offeringId_course_offerings_id_fk" FOREIGN KEY ("offeringId") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_plan_weights" (
  "id" serial PRIMARY KEY NOT NULL,
  "planId" integer NOT NULL,
  "title" varchar(100) NOT NULL,
  "percent" numeric(5, 2) NOT NULL,
  "sortOrder" integer DEFAULT 0,
  CONSTRAINT "lesson_plan_weights_planId_lesson_plans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_plan_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "planId" integer NOT NULL,
  "sessionNo" integer NOT NULL,
  "sessionKind" varchar(10) DEFAULT 'THEORY',
  "topic" varchar(300),
  "details" text,
  "weightId" integer,
  CONSTRAINT "uq_lesson_plan_sessions_plan_session" UNIQUE ("planId", "sessionNo"),
  CONSTRAINT "lesson_plan_sessions_planId_lesson_plans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "lesson_plan_sessions_weightId_lesson_plan_weights_id_fk" FOREIGN KEY ("weightId") REFERENCES "public"."lesson_plan_weights"("id") ON DELETE set null ON UPDATE no action
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_plan_settings" (
  "universityId" integer PRIMARY KEY NOT NULL,
  "isRequired" integer DEFAULT 0,
  "notice" text,
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "lesson_plan_settings_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lesson_plan_sessions_plan" ON "lesson_plan_sessions" ("planId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lesson_plan_weights_plan" ON "lesson_plan_weights" ("planId");

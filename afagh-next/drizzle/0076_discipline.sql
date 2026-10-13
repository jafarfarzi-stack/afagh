-- ════════════════════════════════════════════════════════════════════════
-- 0076 — ماژول «کمیته انضباطی» (Discipline Committee)
-- ────────────────────────────────────────────────────────────────────────
--  بازسازی قابلیت سیستم قدیم (سما): ثبت پروندهٔ انضباطی دانشجو (نوع تخلف،
--  شرح، گزارش‌دهنده، تاریخ)، چرخهٔ وضعیت (در حال بررسی ← در کمیته ←
--  تصمیم‌گیری‌شده ← تجدیدنظر)، تصمیم کمیته (تذکر شفاهی/کتبی، اخطار،
--  تعلیق موقت، اخراج، تبرئه) و پیوست مدارک.
--
--  وضعیت‌ها/تصمیم‌ها به‌صورت متن فارسی در varchar ذخیره می‌شوند (همان
--  قرارداد statusTitle در student_term_states — نه pgEnum).
--
--  ▸ idempotent: IF NOT EXISTS همه‌جا (جدول‌ها + ایندکس‌ها).
--  ▸ دانشگاه‌ناآگاه نیست: universityId برای چنددانشگاهی (مثل 0065).
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discipline_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "studentId" integer NOT NULL,
  "violationType" varchar(150) NOT NULL,
  "description" text,
  "reporterName" varchar(150),
  "status" varchar(30) DEFAULT 'در حال بررسی' NOT NULL,
  "committeeDecision" varchar(100),
  "decisionNotes" text,
  "caseDate" timestamp DEFAULT now(),
  "decidedAt" timestamp,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "discipline_cases_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "discipline_cases_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discipline_case_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "caseId" integer NOT NULL,
  "fileName" varchar(250) NOT NULL,
  "fileUrl" varchar(500) NOT NULL,
  "uploadedAt" timestamp DEFAULT now(),
  CONSTRAINT "discipline_case_documents_caseId_discipline_cases_id_fk" FOREIGN KEY ("caseId") REFERENCES "public"."discipline_cases"("id") ON DELETE cascade ON UPDATE no action
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discipline_cases_student" ON "discipline_cases" ("studentId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discipline_cases_status" ON "discipline_cases" ("status");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discipline_cases_caseDate" ON "discipline_cases" ("caseDate");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discipline_case_documents_case" ON "discipline_case_documents" ("caseId");

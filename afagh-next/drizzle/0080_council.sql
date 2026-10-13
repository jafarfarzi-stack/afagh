-- ══════════════════════════════════════════════════════════════════════
-- 0080 — ماژول «شورای آموزشی» (Academic Council)
-- ────────────────────────────────────────────────────────────────────────
--  بازسازی قابلیت سیستم قدیم (سما): ثبت جلسات شورای آموزشی (تاریخ، عنوان،
--  اعضا، دستور جلسه، صورت‌جلسه) و مصوبات/توصیه‌ها/درخواست‌های تجدیدنظر
--  مرتبط با هر جلسه — به‌صورت اختیاری پیوست‌شده به یک دانشجو، همراه
--  وضعیت اجرا و مهلت.
--
--  نوع/وضعیت‌ها به‌صورت متن فارسی در varchar ذخیره می‌شوند (همان
--  قرارداد statusTitle در student_term_states — نه pgEnum).
--
--  ▸ idempotent: IF NOT EXISTS همه‌جا (جدول‌ها + ایندکس‌ها).
--  ▸ دانشگاه‌ناآگاه نیست: universityId برای چنددانشگاهی (مثل 0065).
--  ▸ فایل الحاقی — هیچ جدول موجودی تغییر نمی‌کند.
--
--  ⚠ این فایل هنوز در drizzle/meta/_journal.json ثبت نشده است؛ ثبتش با
--    اینتگراتور است (رجوع شود به INTEGRATION-council.md).
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "council_meetings" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(250) NOT NULL,
  "meetingDate" timestamp,
  "members" text,
  "agenda" text,
  "minutes" text,
  "universityId" integer,
  "createdBy" integer,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "council_meetings_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "council_meetings_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "council_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "meetingId" integer NOT NULL,
  "studentId" integer,
  "decisionType" varchar(50) DEFAULT 'مصوبه' NOT NULL,
  "content" text NOT NULL,
  "implementationStatus" varchar(30) DEFAULT 'در انتظار اجرا' NOT NULL,
  "deadline" timestamp,
  "universityId" integer,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "council_decisions_meetingId_council_meetings_id_fk" FOREIGN KEY ("meetingId") REFERENCES "public"."council_meetings"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "council_decisions_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "council_decisions_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_council_meetings_date" ON "council_meetings" ("meetingDate");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_council_meetings_uni" ON "council_meetings" ("universityId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_council_decisions_meeting" ON "council_decisions" ("meetingId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_council_decisions_student" ON "council_decisions" ("studentId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_council_decisions_status" ON "council_decisions" ("implementationStatus");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_council_decisions_type" ON "council_decisions" ("decisionType");

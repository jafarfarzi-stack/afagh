-- ════════════════════════════════════════════════════════════════════════
-- 0056 — موظفیِ نقش‌محور (role-based duty) + اسنپ‌شاتِ ترمیِ مرتبه/پایه/نرخ
-- ────────────────────────────────────────────────────────────────────────
--  · payroll_duty_roles: کاتالوگ باز سمت‌های موظفی (دانشگاه‌محور).
--    موظفی از «نقش» استاد می‌آید نه مرتبهٔ علمی.
--    فرمول: موظفی مؤثر = dutyUnits نقشِ تدریسیِ اصلی (اولین برحسب sortOrder)
--    منهای Σ reductionUnits همهٔ نقش‌های منتسب، کفِ صفر؛ بدون نقش تدریسی ←
--    بازگشت به baseDutyUnits قدیمی (سازگار با گذشته).
--  · staff_term_roles: انتساب نقش به استاد در هر ترم.
--  · اسنپ‌شات ترمی: professor_term_contracts و payroll_statements هر سه ستون
--    rankSnapshot / baseSnapshot / rateSnapshot را می‌گیرند (NULL = ردیف قدیمی
--    ← موتور مقدار زنده را می‌خواند). بدون backfill: ردیف‌های قدیمی NULL
--    می‌مانند و با همان منطق fallback کار می‌کنند.
--  ▸ idempotent: IF NOT EXISTS همه‌جا + سید با NOT EXISTS به‌ازای هر دانشگاه.
--  ▸ توجه مالی: اعداد سید (duty/reduction) پیش‌فرض‌اند و باید با تأیید مالی
--    دانشگاه در رابط کاربری اصلاح شوند.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_duty_roles" (
  "id" serial PRIMARY KEY NOT NULL,
  "universityId" integer,
  "code" varchar(40) NOT NULL,
  "title" varchar(150) NOT NULL,
  "dutyUnits" numeric(4, 2),
  "reductionUnits" numeric(4, 2) NOT NULL DEFAULT '0',
  "isTeaching" integer NOT NULL DEFAULT 1,
  "sortOrder" integer NOT NULL DEFAULT 0,
  CONSTRAINT "payroll_duty_roles_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "public"."universities"("id") ON DELETE no action ON UPDATE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_duty_roles_uni_code" ON "payroll_duty_roles" ("universityId", "code");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_term_roles" (
  "id" serial PRIMARY KEY NOT NULL,
  "staffId" integer NOT NULL,
  "termId" integer NOT NULL,
  "roleId" integer NOT NULL,
  "isPrimary" integer NOT NULL DEFAULT 0,
  CONSTRAINT "staff_term_roles_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "staff_term_roles_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "staff_term_roles_roleId_payroll_duty_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."payroll_duty_roles"("id") ON DELETE cascade ON UPDATE no action
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_staff_term_roles" ON "staff_term_roles" ("staffId", "termId", "roleId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_term_roles_term" ON "staff_term_roles" ("termId");

--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD COLUMN IF NOT EXISTS "rankSnapshot" varchar(50);

--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD COLUMN IF NOT EXISTS "baseSnapshot" varchar(20);

--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD COLUMN IF NOT EXISTS "rateSnapshot" numeric(12, 0);

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "rankSnapshot" varchar(50);

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "baseSnapshot" varchar(20);

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "rateSnapshot" numeric(12, 0);

-- ── سید نقش‌های پایه به‌ازای هر دانشگاه (اعداد پیش‌فرض؛ مالی باید تأیید کند) ──
--> statement-breakpoint
INSERT INTO "payroll_duty_roles" ("universityId", "code", "title", "dutyUnits", "reductionUnits", "isTeaching", "sortOrder")
SELECT u."id", 'INVITED', 'استاد مدعو', '0', '0', 1, 10
FROM "universities" u
WHERE NOT EXISTS (SELECT 1 FROM "payroll_duty_roles" r WHERE r."universityId" = u."id" AND r."code" = 'INVITED');

--> statement-breakpoint
INSERT INTO "payroll_duty_roles" ("universityId", "code", "title", "dutyUnits", "reductionUnits", "isTeaching", "sortOrder")
SELECT u."id", 'EDU_DEPUTY', 'معاون آموزشی', NULL, '0', 0, 20
FROM "universities" u
WHERE NOT EXISTS (SELECT 1 FROM "payroll_duty_roles" r WHERE r."universityId" = u."id" AND r."code" = 'EDU_DEPUTY');

--> statement-breakpoint
INSERT INTO "payroll_duty_roles" ("universityId", "code", "title", "dutyUnits", "reductionUnits", "isTeaching", "sortOrder")
SELECT u."id", 'CULTURAL_DEPUTY', 'معاون فرهنگی', NULL, '0', 0, 30
FROM "universities" u
WHERE NOT EXISTS (SELECT 1 FROM "payroll_duty_roles" r WHERE r."universityId" = u."id" AND r."code" = 'CULTURAL_DEPUTY');

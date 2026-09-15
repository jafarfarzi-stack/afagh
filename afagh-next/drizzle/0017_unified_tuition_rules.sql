-- ════════════════════════════════════════════════════════════════════════
-- 0017 — جدول یکپارچهٔ قواعد شهریه (tuition_rules) + درون‌ریزی دادهٔ موجود
-- ────────────────────────────────────────────────────────────────────────
-- جایگزین دو جدول موازی قدیمی می‌شود:
--   ▸ tuition_fee_rules (مقطع + نوع ترم + نوع گذراندن درس) — موتور بدون کد سخت
--   ▸ tuition_formulas  (مقطع + رشته + بازهٔ ورودی) — فرمول تخصیص مالی
--
-- Resolver یکتا با سلسله‌مراتب اولویت:
--   مقطع > رشته > نوع ترم > نوع گذراندن درس > بازهٔ ورودی
--
-- جدول‌های قدیمی برای حسابرسی/بازگشت حفظ می‌شوند؛ اپلیکیشن از این‌پس
-- فقط از tuition_rules می‌خواند و می‌نویسد.
--
-- ▸ نسخه‌دار: هیچ‌چیز به patches.sql نمی‌رود. ▸ درون‌ریزی idempotent است.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tuition_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40),
	"title" varchar(150),
	"degreeLevelId" integer,
	"majorId" integer,
	"termType" varchar(20),
	"offeringType" varchar(30),
	"entryYearFrom" integer,
	"entryYearTo" integer,
	"fixedAmount" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitTheory" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitPractical" numeric(12, 0) DEFAULT '0' NOT NULL,
	"perUnitGeneral" numeric(12, 0) DEFAULT '0' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"note" text,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
-- کلید یکتا برای idempotent کردن درون‌ریزی (ON CONFLICT (code))
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_rules_code_key" ON "tuition_rules" ("code");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_rules" ADD CONSTRAINT "tuition_rules_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "degree_level_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_rules" ADD CONSTRAINT "tuition_rules_majorId_majors_id_fk" FOREIGN KEY ("majorId") REFERENCES "majors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ── درون‌ریزی از tuition_formulas: کد F<id> + priority حفظ می‌شود ──
INSERT INTO "tuition_rules"
	("code", "title", "degreeLevelId", "majorId", "entryYearFrom", "entryYearTo",
	 "fixedAmount", "perUnitTheory", "perUnitPractical", "perUnitGeneral",
	 "priority", "isActive", "note", "updatedAt")
SELECT
	'F' || "id", "title",
	"degreeLevelId", "majorId", "entryYearFrom", "entryYearTo",
	"fixedAmount", "perUnitTheory", "perUnitPractical", "perUnitGeneral",
	"priority", "isActive",
	COALESCE("note", 'درون‌ریزی از فرمول تخصیص'),
	COALESCE("updatedAt", now())
FROM "tuition_formulas"
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- ── درون‌ریزی از tuition_fee_rules: کد E<id>؛ نرخ تک‌واحدی در هر سه سطل ──
-- effectiveFromYear با معنای «قاعده از این ورودی به بعد» کلاً به entryYearFrom می‌رود.
INSERT INTO "tuition_rules"
	("code", "title", "degreeLevelId", "majorId", "termType", "offeringType",
	 "entryYearFrom", "entryYearTo", "fixedAmount",
	 "perUnitTheory", "perUnitPractical", "perUnitGeneral",
	 "priority", "isActive", "note", "updatedAt")
SELECT
	'E' || "id", NULL,
	"degreeLevelId", NULL, "termType", "offeringType",
	"effectiveFromYear", NULL, "fixedTuition",
	"perUnitTuition", "perUnitTuition", "perUnitTuition",
	100, "isActive",
	COALESCE("note", 'درون‌ریزی از قاعدهٔ شهریه'),
	COALESCE("updatedAt", now())
FROM "tuition_fee_rules"
ON CONFLICT ("code") DO NOTHING;
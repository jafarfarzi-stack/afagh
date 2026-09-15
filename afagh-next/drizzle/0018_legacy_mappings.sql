-- ════════════════════════════════════════════════════════════════════════
-- 0018 — جداول نگاشت وضعیت و موجودیت‌های قدیمی (legacy mappings)
-- ────────────────────────────────────────────────────────────────────────
-- ▸ legacy_status_mappings: نگاشت کدهای وضعیت نمرهٔ سما به کدهای آفاق
-- ▸ legacy_entity_mappings: نگاشت موجودیت‌های سما (رشته/مقطع/دانشکده/ترم) به آفاق
--
-- درون‌ریزی SAMA seed data برای ۷ کد وضعیت اصلی نمرات.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_status_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"systemSource" varchar(50) DEFAULT 'SAMA' NOT NULL,
	"sourceCode" varchar(50) NOT NULL,
	"sourceTitle" varchar(150) NOT NULL,
	"targetStatusCode" varchar(50) NOT NULL,
	"targetTitle" varchar(150) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"isPassed" boolean DEFAULT false NOT NULL,
	"isEffectiveInGpa" boolean DEFAULT false NOT NULL,
	"isEffectiveInTermGpa" boolean DEFAULT false NOT NULL,
	"countsTowardsTenure" boolean DEFAULT true NOT NULL,
	"requiresCommissionApproval" boolean DEFAULT false NOT NULL,
	"displayOrder" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_entity_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"systemSource" varchar(50) DEFAULT 'SAMA_AFAGH' NOT NULL,
	"entityType" varchar(50) NOT NULL,
	"sourceCode" varchar(50) NOT NULL,
	"sourceTitle" varchar(150) NOT NULL,
	"targetIdentifier" varchar(100) NOT NULL,
	"targetTitle" varchar(150) NOT NULL,
	"metadata" jsonb,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ── درون‌ریزی SAMA seed: ۷ کد وضعیت اصلی ──
INSERT INTO "legacy_status_mappings"
	("id", "systemSource", "sourceCode", "sourceTitle", "targetStatusCode", "targetTitle", "symbol", "isPassed", "isEffectiveInGpa", "isEffectiveInTermGpa", "countsTowardsTenure", "requiresCommissionApproval", "displayOrder", "isActive")
VALUES
	('map-sama-7', 'SAMA', '7', 'واحد تک‌درس و وضعیت معادل', 'EQUIV', 'معادل', 'وضعیت معادل', true, false, false, false, true, 1, true),
	('map-sama-4', 'SAMA', '4', 'حذف آموزشی', 'ACADEMIC_DROP', 'آ.ح', 'حذف آموزشی', false, false, false, false, true, 2, true),
	('map-sama-3', 'SAMA', '3', 'حذف اضطراری', 'EMERGENCY_DROP', 'حذف اضطراری', 'W', false, false, false, true, false, 3, true),
	('map-sama-8', 'SAMA', '8', 'حذف پزشکی با تأیید هیأت', 'MEDICAL_DROP', 'پ.ح', 'حذف پزشکی', false, false, false, false, true, 4, true),
	('map-sama-5', 'SAMA', '5', 'غیبت موجه در امتحان', 'EXCUSED_ABSENCE', '۹۷', 'غیبت موجه (۹۷)', false, false, false, true, true, 5, true),
	('map-sama-6', 'SAMA', '6', 'غیبت غیرموجه در امتحان (فرصت)', 'UNEXCUSED_ABSENCE', '۹۸', 'غیبت غیرموجه (۹۸)', false, true, true, true, false, 6, true),
	('map-sama-1', 'SAMA', '1', 'قبول عادی', 'PASSED', 'قبول', 'قبول', true, true, true, true, false, 7, true),
	('map-sama-2', 'SAMA', '2', 'مردود عادی', 'FAILED', 'مردود', 'مردود', false, true, true, true, false, 8, true)
ON CONFLICT ("id") DO UPDATE SET
	"sourceTitle" = EXCLUDED."sourceTitle",
	"isPassed" = EXCLUDED."isPassed",
	"isEffectiveInGpa" = EXCLUDED."isEffectiveInGpa",
	"updatedAt" = now();

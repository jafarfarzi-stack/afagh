-- ════════════════════════════════════════════════════════════════════════
-- 0004 — واقعی‌سازی ماژول‌ها (فاز ۱۱): امضای دیجیتال و در دسترس‌بودن استاد
-- ────────────────────────────────────────────────────────────────────────
--  جدید:   signature_otps          (کد یکبارمصرف امضای اسناد — فقط هش SHA-256)
--          professor_availability  (ماتریس در دسترس‌بودن استاد برای زمان‌بندی)
--  ارتقا:  electronic_documents.signedAt (زمان امضای دیجیتال واقعی سند)
--
--  ▸ نسخه‌دار (تصمیم D5): هیچ‌چیز به patches.sql نمی‌رود.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signature_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"refId" integer NOT NULL,
	"otpHash" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"isUsed" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"lockedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "signature_otps" ADD CONSTRAINT "signature_otps_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
ALTER TABLE "professor_availabilities" ADD COLUMN "status" varchar(10) DEFAULT 'AVAIL';

--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD COLUMN "signedAt" timestamp;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "professor_availability_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"termId" integer NOT NULL,
	"note" text NOT NULL,
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "professor_availability_notes" ADD CONSTRAINT "professor_availability_notes_staffId_staff_id_fk" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "professor_availability_notes" ADD CONSTRAINT "professor_availability_notes_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_prof_avail_note" ON "professor_availability_notes" ("staffId","termId");

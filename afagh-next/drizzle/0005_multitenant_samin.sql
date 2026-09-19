-- ════════════════════════════════════════════════════════════════════════
-- 0005 — چنددانشگاهی + ثمین (سازمان امور دانشجویان)
-- ────────────────────────────────────────────────────────────────────────
--  جدید:   universities            — رجیستری دانشگاه‌ها (آفاق + منحل‌شده‌ها)
--          samin_connections       — اتصال ثمین per-university (کلیدهای رمز)
--          samin_staging           — صف ارسال ثمین (jsonb + trace)
--          samin_sync_logs         — لاگ رهگیری ثمین
--  توسعه:  users.* / students.*   — فیلدهای MUST ثمین (nullable، غیرمخرب)
--
--  ▸ نسخه‌دار: هیچ‌چیز به patches.sql نمی‌رود.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "universities" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"title" varchar(150) NOT NULL,
	"kind" varchar(20) DEFAULT 'DISSOLVED' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"saminCode" varchar(20),
	"province" varchar(80),
	"dissolvedAt" varchar(10),
	"note" text,
	"isActive" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "universities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "samin_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"universityId" integer NOT NULL,
	"apiBaseUrl" varchar(255) DEFAULT 'https://apim.saorg.ir' NOT NULL,
	"authBaseUrl" varchar(255) DEFAULT 'https://apiauth.saorg.ir/oauth2/token' NOT NULL,
	"clientId" varchar(200),
	"clientSecretEnc" text,
	"username" varchar(150),
	"passwordEnc" text,
	"tokenEnc" text,
	"tokenExpiresAt" timestamp,
	"lastSyncAt" timestamp,
	"isEnabled" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "samin_connections_universityId_unique" UNIQUE("universityId")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "samin_connections" ADD CONSTRAINT "samin_connections_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "samin_staging" (
	"id" serial PRIMARY KEY NOT NULL,
	"universityId" integer NOT NULL,
	"entityCode" varchar(20) NOT NULL,
	"personPkInSource" varchar(40),
	"studentPkInSource" varchar(40),
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"traceId" integer,
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now(),
	"sentAt" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "samin_staging" ADD CONSTRAINT "samin_staging_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_samin_staging" ON "samin_staging" USING btree ("universityId","entityCode","personPkInSource");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "samin_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"universityId" integer NOT NULL,
	"entityCode" varchar(20) NOT NULL,
	"traceId" integer,
	"status" varchar(20) NOT NULL,
	"summaryResult" jsonb,
	"rawResponse" text,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "samin_sync_logs" ADD CONSTRAINT "samin_sync_logs_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ── ستون‌های MUST ثمین روی users (nullable، غیرمخرب) ──
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firstNameEn" varchar(100);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastNameEn" varchar(100);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passportNumber" varchar(20);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nationality" varchar(10);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "religion" varchar(10);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthPlaceCode" varchar(10);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "issuePlaceCode" varchar(10);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postalCode" varchar(10);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isAlive" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "saminPersonPk" varchar(40);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "saminIsVerified" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "saminVerifyCheckDate" timestamp;
--> statement-breakpoint
-- ── ستون‌های MUST ثمین روی students ──
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "students" ADD CONSTRAINT "students_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "saminStudentPk" varchar(40);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "senderUniversityCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "nativeType" varchar(10);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "ethnicity" varchar(10);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "sanjeshFileNumber" varchar(40);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "sanjeshApplicantNumber" varchar(40);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "saminFieldCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "saminLocalFieldCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "acceptanceAllocation" varchar(30);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "acceptanceType" varchar(30);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "studyingMode" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "trainingMethod" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "isaarCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "totalAverage" numeric(4,2);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "eduEndYear" integer;
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "eduEndSemester" integer;
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "graduateDate" varchar(10);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "totalTakenUnits" integer;
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "totalPassedUnits" integer;
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "totalFailedUnits" integer;
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "saminDescription" text;
--> statement-breakpoint
-- ── seed اولیه: ۵ دانشگاه ──
INSERT INTO "universities" ("code","title","kind","status","province") VALUES
 ('AFAGH','دانشگاه آفاق','OWN','ACTIVE','آذربایجان غربی'),
 ('ZARINE','آموزشکده زرینه','DISSOLVED','ACTIVE','آذربایجان غربی'),
 ('ALLAME','آموزشکده علامه','DISSOLVED','ACTIVE','آذربایجان غربی'),
 ('SHAMS','موسسه شمس خوی','DISSOLVED','ACTIVE','آذربایجان غربی'),
 ('NAZHAND','موسسه نژند','DISSOLVED','ACTIVE','آذربایجان غربی')
ON CONFLICT ("code") DO NOTHING;

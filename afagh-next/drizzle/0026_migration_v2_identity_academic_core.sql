-- ══════════════════════════════════════════════════════════════════════
-- 0026 — Migration V2: هسته هویت مستقل و ارتقای سوابق تحصیلی
-- ────────────────────────────────────────────────────────────────────────
--  1. ایجاد جداول persons, person_source_identities, identity_resolution_reviews
--  2. اتصال کلید خارجی personId به users و students
--  3. افزودن فیلدهای ترتیبی sortOrder و academicYear به academic_terms
--  4. افزودن ستون‌های تاریخی و نرمال‌شده به student_term_states
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "persons" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonicalFirstName" varchar(100),
	"canonicalLastName" varchar(100),
	"canonicalFatherName" varchar(100),
	"canonicalNationalCode" varchar(10),
	"canonicalBirthDate" date,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_persons_national_code" ON "persons" ("canonicalNationalCode") WHERE "canonicalNationalCode" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_source_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"personId" integer REFERENCES "persons"("id") ON DELETE SET NULL,
	"universityId" integer NOT NULL REFERENCES "universities"("id") ON DELETE RESTRICT,
	"studentId" integer REFERENCES "students"("id") ON DELETE SET NULL,
	"sourceStudentCode" varchar(50) NOT NULL,
	"sourceNationalCode" varchar(10),
	"sourceFirstName" varchar(100),
	"sourceLastName" varchar(100),
	"sourceFatherName" varchar(100),
	"sourceBirthDate" date,
	"normalizedFirstName" varchar(100),
	"normalizedLastName" varchar(100),
	"normalizedFatherName" varchar(100),
	"identityStatus" varchar(40) DEFAULT 'UNRESOLVED' NOT NULL,
	"matchMethod" varchar(60),
	"matchConfidence" numeric(5, 4),
	"isPrimarySource" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "uq_person_source_identity" UNIQUE ("universityId", "sourceStudentCode")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_source_identity_person" ON "person_source_identities" ("personId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_source_identity_national" ON "person_source_identities" ("sourceNationalCode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_source_identity_student" ON "person_source_identities" ("studentId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identity_resolution_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceIdentityId" integer NOT NULL REFERENCES "person_source_identities"("id") ON DELETE CASCADE,
	"candidatePersonId" integer REFERENCES "persons"("id") ON DELETE SET NULL,
	"candidateSourceIdentityId" integer REFERENCES "person_source_identities"("id") ON DELETE SET NULL,
	"resolution" varchar(40) NOT NULL,
	"matchMethod" varchar(60),
	"confidence" numeric(5, 4),
	"sourceNationalCode" varchar(10),
	"candidateNationalCode" varchar(10),
	"sourceStudentCode" varchar(50),
	"candidateStudentCode" varchar(50),
	"sourceUniversityId" integer,
	"candidateUniversityId" integer,
	"reason" text,
	"reviewStatus" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_identity_reviews_source" ON "identity_resolution_reviews" ("sourceIdentityId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_identity_reviews_candidate" ON "identity_resolution_reviews" ("candidatePersonId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_identity_reviews_status" ON "identity_resolution_reviews" ("reviewStatus");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_identity_reviews_resolution" ON "identity_resolution_reviews" ("resolution");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personId" integer REFERENCES "persons"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_personId" ON "users" ("personId");
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "personId" integer REFERENCES "persons"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_students_personId" ON "students" ("personId");
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "sortOrder" integer;
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "academicYear" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_academic_terms_sortOrder" ON "academic_terms" ("sortOrder");
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourceStatusCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourceStatusTitle" varchar(150);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourceTermAvg" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "normalizedStatusCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "normalizedStatusTitle" varchar(150);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "normalizedTermAvg" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourceProbation" integer;
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "calculatedProbation" integer;
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourceCompletedUnits" numeric(4, 1);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourcePassedUnits" numeric(4, 1);
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "sourceAttemptedUnits" numeric(4, 1);

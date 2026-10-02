-- Thesis/Proposal tracking tables for automated graduation process
-- Phase 1: Supervisor assignment & title registration with Irandoc prior-check
-- Phase 2: Proposal writing → similarity check → expert review → approval → Irandoc upload
-- Phase 3: Progress reports → Defense request → Supervisor approval → Expert approval
--         → Room/Jury assignment → Defense → Final thesis → Irandoc final → Certificate

-- === Thesis progress tracking (replaces/extends graduation_audits for thesis workflow) ===
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_progress" (
  "id" serial PRIMARY KEY,
  "auditId" integer NOT NULL REFERENCES "graduation_audits"("id"),
  "studentId" integer NOT NULL REFERENCES "students"("id"),

  -- Phase 1: Supervisor & Title
  "supervisorId" integer REFERENCES "staff"("id"),
  "advisorId" integer REFERENCES "staff"("id"),
  "titleFa" varchar(300),
  "titleEn" varchar(300),
  "keywords" text,
  "abstract" text,

  -- Irandoc prior-check (before proposal writing)
  "irandocPriorTracking" varchar(60),
  "irandocPriorSimilarity" numeric(5,2),
  "irandocPriorStatus" varchar(30) DEFAULT 'PENDING', -- PENDING|PASSED|REJECTED|SKIPPED
  "irandocPriorCheckedAt" timestamp,

  -- Phase 2: Proposal
  "proposalFileId" integer, -- reference to object_store or student_documents
  "proposalSubmittedAt" timestamp,
  "proposalSimilarity" numeric(5,2),
  "proposalStatus" varchar(30) DEFAULT 'NOT_STARTED', -- NOT_STARTED|SUBMITTED|SIMILARITY_CHECK|EXPERT_REVIEW|APPROVED|REJECTED
  "proposalApprovedAt" timestamp,
  "proposalApprovedBy" integer REFERENCES "users"("id"),

  -- Irandoc upload after approval
  "irandocUploadTracking" varchar(60),
  "irandocUploadStatus" varchar(30) DEFAULT 'PENDING', -- PENDING|UPLOADED|CERTIFICATE_ISSUED
  "irandocCertificateFileId" integer,
  "irandocUploadedAt" timestamp,

  -- Phase 3: Progress Reports (3-month / 6-month)
  "lastProgressReportAt" timestamp,
  "nextProgressReportDue" timestamp,
  "progressReportCount" integer DEFAULT 0,

  -- Defense Request
  "defenseRequestedAt" timestamp,
  "defenseRequestStatus" varchar(30) DEFAULT 'NOT_REQUESTED', -- NOT_REQUESTED|SUPERVISOR_REVIEW|EXPERT_REVIEW|SCHEDULED|CONDUCTED|PASSED|FAILED
  "defenseRoomId" integer REFERENCES "classrooms"("id"),
  "defenseScheduledAt" timestamp,
  "defenseConductedAt" timestamp,
  "defenseResult" varchar(30), -- PASSED|FAILED|CONDITIONAL
  "defenseNote" text,

  -- Final Thesis
  "finalThesisFileId" integer,
  "finalThesisSubmittedAt" timestamp,
  "finalIrandocTracking" varchar(60),
  "finalIrandocSimilarity" numeric(5,2),
  "finalIrandocStatus" varchar(30) DEFAULT 'PENDING', -- PENDING|PASSED|REJECTED
  "finalIrandocCheckedAt" timestamp,

  -- Jury (multiple examiners)
  "juryChairId" integer REFERENCES "staff"("id"),      -- رئیس جلسه
  "jurySupervisorId" integer REFERENCES "staff"("id"), -- استاد راهنما
  "juryInternalId" integer REFERENCES "staff"("id"),   -- داور داخلی
  "juryExternalId" integer REFERENCES "staff"("id"),   -- داور خارجی

  "createdAt" timestamp DEFAULT NOW(),
  "updatedAt" timestamp DEFAULT NOW(),
  "universityId" integer REFERENCES "universities"("id")
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thesis_progress_student" ON "thesis_progress"("studentId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thesis_progress_audit" ON "thesis_progress"("auditId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thesis_progress_status" ON "thesis_progress"("proposalStatus", "defenseRequestStatus");

-- === Progress Reports ===
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thesis_progress_reports" (
  "id" serial PRIMARY KEY,
  "thesisProgressId" integer NOT NULL REFERENCES "thesis_progress"("id") ON DELETE CASCADE,
  "studentId" integer NOT NULL REFERENCES "students"("id"),
  "reportPeriodStart" date NOT NULL,
  "reportPeriodEnd" date NOT NULL,
  "reportText" text NOT NULL,
  "supervisorConfirmed" integer DEFAULT 0,
  "supervisorConfirmedAt" timestamp,
  "fileId" integer, -- PDF attachment
  "createdAt" timestamp DEFAULT NOW(),
  "universityId" integer REFERENCES "universities"("id")
);

-- === Defense Jury Pool (predefined juries for auto-assignment) ===
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "defense_jury_pools" (
  "id" serial PRIMARY KEY,
  "departmentCode" varchar(40) NOT NULL,
  "majorId" integer REFERENCES "majors"("id"),
  "chairId" integer REFERENCES "staff"("id"),       -- Default chair
  "internalIds" integer[] DEFAULT '{}',         -- Pool of internal examiners
  "externalIds" integer[] DEFAULT '{}',         -- Pool of external examiners
  "roomId" integer REFERENCES "classrooms"("id"),   -- Default room
  "isActive" integer DEFAULT 1,
  "universityId" integer REFERENCES "universities"("id")
);

-- === Defense Sessions (scheduled defenses) ===
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "defense_sessions" (
  "id" serial PRIMARY KEY,
  "thesisProgressId" integer NOT NULL REFERENCES "thesis_progress"("id"),
  "studentId" integer NOT NULL REFERENCES "students"("id"),
  "scheduledAt" timestamp NOT NULL,
  "roomId" integer REFERENCES "classrooms"("id"),
  "chairId" integer REFERENCES "staff"("id"),
  "supervisorId" integer REFERENCES "staff"("id"),
  "internalId" integer REFERENCES "staff"("id"),
  "externalId" integer REFERENCES "staff"("id"),
  "status" varchar(30) DEFAULT 'SCHEDULED', -- SCHEDULED|CONDUCTED|CANCELLED|RESCHEDULED
  "result" varchar(30), -- PASSED|FAILED|CONDITIONAL
  "minutes" text, -- Defense minutes/notes
  "createdAt" timestamp DEFAULT NOW(),
  "universityId" integer REFERENCES "universities"("id")
);

-- === Irandoc Integration Log ===
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "irandoc_logs" (
  "id" serial PRIMARY KEY,
  "thesisProgressId" integer REFERENCES "thesis_progress"("id"),
  "studentId" integer NOT NULL REFERENCES "students"("id"),
  "checkType" varchar(30) NOT NULL, -- PRIOR|PROPOSAL|FINAL
  "trackingCode" varchar(60),
  "title" varchar(300),
  "similarityPercentage" numeric(5,2),
  "decision" varchar(30), -- AUTO_APPROVE|MANUAL_REVIEW|REJECT
  "rawResponse" jsonb,
  "checkedAt" timestamp DEFAULT NOW(),
  "universityId" integer REFERENCES "universities"("id")
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_irandoc_logs_student_type" ON "irandoc_logs"("studentId", "checkType");

-- === Unique constraints declared in src/db/schema.ts ===
-- PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS"; guard each with a
-- duplicate_object exception so re-running the migration is a no-op.
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "thesis_progress" ADD CONSTRAINT "uq_thesis_progress_audit" UNIQUE ("auditId");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "thesis_progress_reports" ADD CONSTRAINT "uq_thesis_report_period" UNIQUE ("thesisProgressId","reportPeriodStart","reportPeriodEnd");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "defense_sessions" ADD CONSTRAINT "uq_defense_session_progress" UNIQUE ("thesisProgressId");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
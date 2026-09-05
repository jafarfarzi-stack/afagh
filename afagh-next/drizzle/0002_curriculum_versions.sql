-- ════════════════════════════════════════════════════════════════════════
-- 0002 — Domain برنامهٔ درسی (Curriculum): نسخه‌بندی، چرخهٔ حیات و تأیید
-- ────────────────────────────────────────────────────────────────────────
--  تبدیل:  syllabuses → curriculum_versions  (تصمیم D1)
--          syllabus_courses → curriculum_courses
--  جدید:   curriculum_tracks · curriculum_approvals
--
--  ▸ این مهاجرت «نسخه‌دار» است (تصمیم D5): از این پس تغییرات Curriculum
--    فقط از راه مهاجرت‌ها وارد می‌شوند؛ هیچ‌چیز به patches.sql نمی‌رود.
--  ▸ دادهٔ موجود (دمو/seed) به‌صورت امن منتقل می‌شود؛ وضعیت نسخه‌ها پس از
--    پرشدن: جدیدترینِ هر (رشته، مقطع، گرایش) = PUBLISHED، بقیه = ARCHIVED.
--  ▸ قیدهای یکتاییِ محافظت‌شده (coalesce برای trackId=NULL) و «فقط یک
--    PUBLISHED فعال» به‌صورت ایندکس جزئی اعمال می‌شوند (نگاه کنید به schema.ts).
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "syllabuses" RENAME TO "curriculum_versions";
--> statement-breakpoint
ALTER TABLE "syllabus_courses" RENAME TO "curriculum_courses";
--> statement-breakpoint
ALTER TABLE "curriculum_courses" RENAME COLUMN "syllabusId" TO "curriculumVersionId";
--> statement-breakpoint
ALTER TABLE "curriculum_courses" RENAME COLUMN "semesterNo" TO "recommendedSemester";
--> statement-breakpoint
ALTER TABLE "curriculum_versions" RENAME COLUMN "entryYearStart" TO "entryYearFrom";
--> statement-breakpoint
ALTER TABLE "curriculum_versions" RENAME COLUMN "entryYearEnd" TO "entryYearTo";
--> statement-breakpoint
ALTER TABLE "curriculum_versions" RENAME COLUMN "minTotalUnitsToGraduate" TO "totalRequiredUnits";
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ALTER COLUMN "totalRequiredUnits" TYPE numeric(5,1);
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "degreeLevelId" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "trackId" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "versionCode" varchar(20);
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "title" varchar(150);
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "status" varchar(20) DEFAULT 'DRAFT' NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "effectiveFrom" varchar(10);
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "effectiveTo" varchar(10);
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "maxUnitsPerTerm" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "approvalId" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "createdByStaffId" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "updatedAt" timestamp DEFAULT now();

--> statement-breakpoint
CREATE TABLE "curriculum_tracks" (
  "id" serial PRIMARY KEY,
  "majorId" integer NOT NULL,
  "title" varchar(100) NOT NULL,
  "code" varchar(20),
  "isActive" integer DEFAULT 1,
  CONSTRAINT "curriculum_tracks_majorId_majors_id_fk" FOREIGN KEY ("majorId") REFERENCES "public"."majors"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_curriculum_tracks_major_title" ON "curriculum_tracks" USING btree ("majorId","title");

--> statement-breakpoint
-- ── بازپرشدن دادهٔ موجود پیش از NOT NULL ──
-- مقطع نسخه از رشتهٔ مرجع؛ شناسهٔ نسخه از سال شروع؛ عنوان از نام رشته ──
UPDATE "curriculum_versions" cv
SET "degreeLevelId" = m."degreeLevelId"
FROM "majors" m
WHERE m."id" = cv."majorId";
--> statement-breakpoint
UPDATE "curriculum_versions" cv
SET "versionCode" = cv."entryYearFrom"::text;
--> statement-breakpoint
-- اگر دو نسخه با یک سال شروع/رشته/مقطع وجود داشته باشد، کد دومی به شکل R1 می‌شود
UPDATE "curriculum_versions" cv
SET "versionCode" = cv."versionCode" || '-R' || (dup.rn - 1)::text
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "majorId", "degreeLevelId", coalesce("trackId",0), "versionCode"
    ORDER BY "id"
  ) AS rn
  FROM "curriculum_versions"
) dup
WHERE dup."id" = cv."id" AND dup.rn > 1;
--> statement-breakpoint
UPDATE "curriculum_versions" cv
SET "title" = 'برنامهٔ ' || m."name" || ' ' || cv."versionCode"
FROM "majors" m
WHERE m."id" = cv."majorId";
--> statement-breakpoint
UPDATE "curriculum_versions" SET "totalRequiredUnits" = coalesce("totalRequiredUnits", 0);

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ALTER COLUMN "degreeLevelId" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ALTER COLUMN "versionCode" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ALTER COLUMN "title" SET NOT NULL;

--> statement-breakpoint
-- ── جدول چرخهٔ تأیید (قبل از FK ستون approvalId) ──
CREATE TABLE "curriculum_approvals" (
  "id" serial PRIMARY KEY,
  "curriculumVersionId" integer NOT NULL,
  "approvalType" varchar(20) NOT NULL,
  "fromStatus" varchar(20),
  "toStatus" varchar(20) NOT NULL,
  "approvedByStaffId" integer NOT NULL,
  "approvedByUserId" integer NOT NULL,
  "decisionNote" text,
  "approvedAt" timestamp DEFAULT now(),
  "signatureDocumentId" integer,
  CONSTRAINT "curriculum_approvals_curriculumVersionId_curriculum_versions_id_fk" FOREIGN KEY ("curriculumVersionId") REFERENCES "public"."curriculum_versions"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "curriculum_approvals_approvedByStaffId_staff_id_fk" FOREIGN KEY ("approvedByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "curriculum_approvals_approvedByUserId_users_id_fk" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "curriculum_approvals_signatureDocumentId_electronic_documents_id_fk" FOREIGN KEY ("signatureDocumentId") REFERENCES "public"."electronic_documents"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "curriculum_approvals_version_idx" ON "curriculum_approvals" USING btree ("curriculumVersionId","approvedAt");

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_degreeLevelId_degree_level_configs_id_fk" FOREIGN KEY ("degreeLevelId") REFERENCES "public"."degree_level_configs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_trackId_curriculum_tracks_id_fk" FOREIGN KEY ("trackId") REFERENCES "public"."curriculum_tracks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_approvalId_curriculum_approvals_id_fk" FOREIGN KEY ("approvalId") REFERENCES "public"."curriculum_approvals"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_createdByStaffId_staff_id_fk" FOREIGN KEY ("createdByStaffId") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_status_check" CHECK ("status" IN ('DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED'));

--> statement-breakpoint
-- ── وضعیت نسخه‌های موجود: جدیدترینِ هر (رشته، مقطع، گرایش) = PUBLISHED، بقیه = ARCHIVED ──
WITH ranked AS (
  SELECT cv."id", row_number() OVER (
    PARTITION BY cv."majorId", cv."degreeLevelId", coalesce(cv."trackId",0)
    ORDER BY cv."entryYearFrom" DESC, cv."id" DESC
  ) AS rn
  FROM "curriculum_versions" cv
)
UPDATE "curriculum_versions" cv
SET "status" = CASE WHEN ranked.rn = 1 THEN 'PUBLISHED' ELSE 'ARCHIVED' END
FROM ranked
WHERE ranked."id" = cv."id";

--> statement-breakpoint
-- ── قیدهای یکتاییِ محافظت‌شده (coalesce چون trackId=NULL نباید تکراری را مجاز کند) ──
CREATE UNIQUE INDEX "uq_curriculum_versions_version_code"
  ON "curriculum_versions" USING btree ("majorId","degreeLevelId",coalesce("trackId",0),"versionCode");
--> statement-breakpoint
-- فقط یک نسخهٔ فعال منتشرشده به ازای هر (رشته، مقطع، گرایش)
CREATE UNIQUE INDEX "uq_curriculum_versions_published"
  ON "curriculum_versions" USING btree ("majorId","degreeLevelId",coalesce("trackId",0))
  WHERE "status" = 'PUBLISHED';
--> statement-breakpoint
CREATE INDEX "curriculum_versions_resolution_idx"
  ON "curriculum_versions" USING btree ("majorId","entryYearFrom","entryYearTo");

--> statement-breakpoint
-- ── ستون‌های جدید curriculum_courses ──
ALTER TABLE "curriculum_courses" ADD COLUMN "roleType" varchar(20) DEFAULT 'CORE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "units" numeric(3,1);
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "theoryUnits" numeric(3,1);
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "practicalUnits" numeric(3,1);
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "isRequired" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "isElective" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "isGraduationRequired" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "minGrade" numeric(4,2);
--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN "autoCorequisiteAllowed" integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_role_check" CHECK ("roleType" IN ('CORE','MAJOR','ELECTIVE','GENERAL','THESIS','INTERNSHIP','WORKSHOP'));

--> statement-breakpoint
-- ── حذف تکراری‌های احتمالی پیش از قید یکتا (fail-closed نیست: فقط ردیفِ تکراریِ id بزرگ‌تر) ──
DELETE FROM "curriculum_courses" a
USING "curriculum_courses" b
WHERE a."id" > b."id"
  AND a."curriculumVersionId" = b."curriculumVersionId"
  AND a."courseId" = b."courseId";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_curriculum_courses_version_course" ON "curriculum_courses" USING btree ("curriculumVersionId","courseId");
--> statement-breakpoint
CREATE INDEX "curriculum_courses_semester_idx" ON "curriculum_courses" USING btree ("curriculumVersionId","recommendedSemester");

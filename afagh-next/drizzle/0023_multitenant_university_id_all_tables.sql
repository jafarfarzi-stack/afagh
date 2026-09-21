-- ════════════════════════════════════════════════════════════════════════
-- 0023 — چنددانشگاهی: اضافه‌کردن universityId به تمام جدولهای باقیمانده
-- ────────────────────────────────────────────────────────────────────────
--  مهاجرت 0016 فقط users/staff/departments/courses را پوشش داد.
--  این migration بقیهٔ جدولها را اضافه می‌کند تا هر دانشگاه کاملاً مجزا باشد.
--
--  الگو: هر جدول ← ALTER TABLE ADD COLUMN → FK → backfill از parent
--  backfill از طریق FKهای موجود (مثلاً enrollments ← students.universityId)
--
--  ▸ نسخه‌دار: هیچ‌چیز به patches.sql نمی‌رود.
-- ════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
--  ۱. هستهٔ آموزشی (هیچ FK مستقیمی به دانشگاه ندارند)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "faculties" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "faculties" ADD CONSTRAINT "faculties_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "faculties" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "academic_terms" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "classrooms" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "educational_regulations" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "educational_regulations" ADD CONSTRAINT "educational_regulations_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "educational_regulations" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_id_formulas" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_id_formulas" ADD CONSTRAINT "student_id_formulas_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_id_formulas" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "sanjesh_mappings" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sanjesh_mappings" ADD CONSTRAINT "sanjesh_mappings_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "sanjesh_mappings" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "admissions_staging" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "admissions_staging" ADD CONSTRAINT "admissions_staging_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "admissions_staging" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "majors" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "majors" ADD CONSTRAINT "majors_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "majors" m SET "universityId" = f."universityId" FROM "faculties" f WHERE m."facultyId" = f."id" AND m."universityId" IS NULL;
--> statement-breakpoint
UPDATE "majors" m SET "universityId" = d."universityId" FROM "departments" d WHERE m."departmentId" = d."id" AND m."universityId" IS NULL;
--> statement-breakpoint
UPDATE "majors" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۲. برنامهٔ درسی (از طریق curriculum_versions.majorId → majors.universityId)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "curriculum_tracks" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "curriculum_tracks" ADD CONSTRAINT "curriculum_tracks_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "curriculum_tracks" ct SET "universityId" = m."universityId" FROM "majors" m WHERE ct."majorId" = m."id" AND ct."universityId" IS NULL;
--> statement-breakpoint
UPDATE "curriculum_tracks" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "curriculum_versions" cv SET "universityId" = m."universityId" FROM "majors" m WHERE cv."majorId" = m."id" AND cv."universityId" IS NULL;
--> statement-breakpoint
UPDATE "curriculum_versions" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "curriculum_courses" cc SET "universityId" = c."universityId" FROM "courses" c WHERE cc."courseId" = c."id" AND cc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "curriculum_courses" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "curriculum_approvals" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "curriculum_approvals" ADD CONSTRAINT "curriculum_approvals_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "curriculum_approvals" ca SET "universityId" = cv."universityId" FROM "curriculum_versions" cv WHERE ca."curriculumVersionId" = cv."id" AND ca."universityId" IS NULL;
--> statement-breakpoint
UPDATE "curriculum_approvals" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "course_rules" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "course_rules" ADD CONSTRAINT "course_rules_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "course_rules" cr SET "universityId" = c."universityId" FROM "courses" c WHERE cr."courseId" = c."id" AND cr."universityId" IS NULL;
--> statement-breakpoint
UPDATE "course_rules" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۳. ارائهٔ دروس و ثبت‌نام (از طریق course_offerings.courseId → courses)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "course_offerings" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "course_offerings" co SET "universityId" = c."universityId" FROM "courses" c WHERE co."courseId" = c."id" AND co."universityId" IS NULL;
--> statement-breakpoint
UPDATE "course_offerings" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "offering_professors" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "offering_professors" ADD CONSTRAINT "offering_professors_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "offering_professors" op SET "universityId" = co."universityId" FROM "course_offerings" co WHERE op."offeringId" = co."id" AND op."universityId" IS NULL;
--> statement-breakpoint
UPDATE "offering_professors" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "enrollments" e SET "universityId" = s."universityId" FROM "students" s WHERE e."studentId" = s."id" AND e."universityId" IS NULL;
--> statement-breakpoint
UPDATE "enrollments" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "cart_items" ci SET "universityId" = s."universityId" FROM "students" s WHERE ci."studentId" = s."id" AND ci."universityId" IS NULL;
--> statement-breakpoint
UPDATE "cart_items" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۴. برنامه‌ریزی درسی
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "schedules" ADD CONSTRAINT "schedules_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "schedules" sc SET "universityId" = co."universityId" FROM "course_offerings" co WHERE sc."offeringId" = co."id" AND sc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "schedules" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "professor_availabilities" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "professor_availabilities" ADD CONSTRAINT "professor_availabilities_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "professor_availabilities" pa SET "universityId" = s."universityId" FROM "staff" s WHERE pa."staffId" = s."id" AND pa."universityId" IS NULL;
--> statement-breakpoint
UPDATE "professor_availabilities" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "term_scheduling_states" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "term_scheduling_states" ADD CONSTRAINT "term_scheduling_states_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "term_scheduling_states" tss SET "universityId" = at."universityId" FROM "academic_terms" at WHERE tss."termId" = at."id" AND tss."universityId" IS NULL;
--> statement-breakpoint
UPDATE "term_scheduling_states" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "scheduling_room_grants" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "scheduling_room_grants" ADD CONSTRAINT "scheduling_room_grants_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "scheduling_room_grants" srg SET "universityId" = at."universityId" FROM "academic_terms" at WHERE srg."termId" = at."id" AND srg."universityId" IS NULL;
--> statement-breakpoint
UPDATE "scheduling_room_grants" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "scheduling_allocations" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "scheduling_allocations" ADD CONSTRAINT "scheduling_allocations_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "scheduling_allocations" sa SET "universityId" = at."universityId" FROM "academic_terms" at WHERE sa."termId" = at."id" AND sa."universityId" IS NULL;
--> statement-breakpoint
UPDATE "scheduling_allocations" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۵. نمرات و وضعیت ترمی
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_term_states" ADD CONSTRAINT "student_term_states_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_term_states" sts SET "universityId" = s."universityId" FROM "students" s WHERE sts."studentId" = s."id" AND sts."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_term_states" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "grade_appeals" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "grade_appeals" ADD CONSTRAINT "grade_appeals_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "grade_appeals" ga SET "universityId" = e."universityId" FROM "enrollments" e WHERE ga."enrollmentId" = e."id" AND ga."universityId" IS NULL;
--> statement-breakpoint
UPDATE "grade_appeals" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "grade_change_log" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "grade_change_log" ADD CONSTRAINT "grade_change_log_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "grade_change_log" gcl SET "universityId" = e."universityId" FROM "enrollments" e WHERE gcl."enrollmentId" = e."id" AND gcl."universityId" IS NULL;
--> statement-breakpoint
UPDATE "grade_change_log" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "grade_submission_otps" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "grade_submission_otps" ADD CONSTRAINT "grade_submission_otps_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "grade_submission_otps" gso SET "universityId" = co."universityId" FROM "course_offerings" co WHERE gso."offeringId" = co."id" AND gso."universityId" IS NULL;
--> statement-breakpoint
UPDATE "grade_submission_otps" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "transcript_snapshots" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "transcript_snapshots" ADD CONSTRAINT "transcript_snapshots_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "transcript_snapshots" ts SET "universityId" = s."universityId" FROM "students" s WHERE ts."studentId" = s."id" AND ts."universityId" IS NULL;
--> statement-breakpoint
UPDATE "transcript_snapshots" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۶. شهریه و مالی
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "term_financial_rules" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "term_financial_rules" ADD CONSTRAINT "term_financial_rules_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "term_financial_rules" tfr SET "universityId" = at."universityId" FROM "academic_terms" at WHERE tfr."termId" = at."id" AND tfr."universityId" IS NULL;
--> statement-breakpoint
UPDATE "term_financial_rules" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "tuition_fee_rules" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_fee_rules" ADD CONSTRAINT "tuition_fee_rules_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tuition_fee_rules" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "tuition_rules" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_rules" ADD CONSTRAINT "tuition_rules_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tuition_rules" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "tuition_formulas" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_formulas" ADD CONSTRAINT "tuition_formulas_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tuition_formulas" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_ledger" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_ledger" ADD CONSTRAINT "student_ledger_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_ledger" sl SET "universityId" = s."universityId" FROM "students" s WHERE sl."studentId" = s."id" AND sl."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_ledger" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "financial_clearances" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "financial_clearances" ADD CONSTRAINT "financial_clearances_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "financial_clearances" fc SET "universityId" = s."universityId" FROM "students" s WHERE fc."studentId" = s."id" AND fc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "financial_clearances" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "tuition_discount_types" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_discount_types" ADD CONSTRAINT "tuition_discount_types_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tuition_discount_types" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_discounts" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_discounts" sd SET "universityId" = s."universityId" FROM "students" s WHERE sd."studentId" = s."id" AND sd."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_discounts" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "tuition_sponsors" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_sponsors" ADD CONSTRAINT "tuition_sponsors_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tuition_sponsors" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_sponsorships" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_sponsorships" ADD CONSTRAINT "student_sponsorships_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_sponsorships" ss SET "universityId" = s."universityId" FROM "students" s WHERE ss."studentId" = s."id" AND ss."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_sponsorships" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "payment_cheques" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "payment_cheques" ADD CONSTRAINT "payment_cheques_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "payment_cheques" pc SET "universityId" = s."universityId" FROM "students" s WHERE pc."studentId" = s."id" AND pc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "payment_cheques" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "loan_products" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "loan_products" ADD CONSTRAINT "loan_products_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "loan_products" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_loans" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_loans" ADD CONSTRAINT "student_loans_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_loans" sl2 SET "universityId" = s."universityId" FROM "students" s WHERE sl2."studentId" = s."id" AND sl2."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_loans" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "tuition_coefficients" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tuition_coefficients" ADD CONSTRAINT "tuition_coefficients_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tuition_coefficients" tc SET "universityId" = at."universityId" FROM "academic_terms" at WHERE (tc."termId" = at."id" OR tc."term_id" = at."id") AND tc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "tuition_coefficients" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "subject_fee_types" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "subject_fee_types" ADD CONSTRAINT "subject_fee_types_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "subject_fee_types" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_subject_fees" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_subject_fees" ADD CONSTRAINT "student_subject_fees_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_subject_fees" ssf SET "universityId" = s."universityId" FROM "students" s WHERE (ssf."student_id" = s."id") AND ssf."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_subject_fees" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۷. امتحانات
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "exam_halls" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_halls" ADD CONSTRAINT "exam_halls_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_halls" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_sessions" es SET "universityId" = at."universityId" FROM "academic_terms" at WHERE es."termId" = at."id" AND es."universityId" IS NULL;
--> statement-breakpoint
UPDATE "exam_sessions" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_calendar_configs" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_calendar_configs" ADD CONSTRAINT "exam_calendar_configs_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_calendar_configs" ec SET "universityId" = at."universityId" FROM "academic_terms" at WHERE ec."termId" = at."id" AND ec."universityId" IS NULL;
--> statement-breakpoint
UPDATE "exam_calendar_configs" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "seat_allocations" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "seat_allocations" sa SET "universityId" = e."universityId" FROM "enrollments" e WHERE sa."enrollmentId" = e."id" AND sa."universityId" IS NULL;
--> statement-breakpoint
UPDATE "seat_allocations" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "invigilators" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "invigilators" ADD CONSTRAINT "invigilators_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "invigilators" inv SET "universityId" = s."universityId" FROM "staff" s WHERE inv."staffId" = s."id" AND inv."universityId" IS NULL;
--> statement-breakpoint
UPDATE "invigilators" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_remuneration_rates" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_remuneration_rates" ADD CONSTRAINT "exam_remuneration_rates_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_remuneration_rates" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "professor_exam_attendance" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "professor_exam_attendance" ADD CONSTRAINT "professor_exam_attendance_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "professor_exam_attendance" pea SET "universityId" = s."universityId" FROM "staff" s WHERE pea."staffId" = s."id" AND pea."universityId" IS NULL;
--> statement-breakpoint
UPDATE "professor_exam_attendance" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_minutes" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_minutes" ADD CONSTRAINT "exam_minutes_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_minutes" em SET "universityId" = es."universityId" FROM "exam_sessions" es WHERE em."sessionId" = es."id" AND em."universityId" IS NULL;
--> statement-breakpoint
UPDATE "exam_minutes" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_attendances" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_attendances" ADD CONSTRAINT "exam_attendances_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_attendances" ea SET "universityId" = s."universityId" FROM "students" s WHERE ea."studentId" = s."id" AND ea."universityId" IS NULL;
--> statement-breakpoint
UPDATE "exam_attendances" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_invigilators" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_invigilators" ADD CONSTRAINT "exam_invigilators_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_invigilators" ei SET "universityId" = s."universityId" FROM "staff" s WHERE ei."staffId" = s."id" AND ei."universityId" IS NULL;
--> statement-breakpoint
UPDATE "exam_invigilators" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "exam_course_packets" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "exam_course_packets" ADD CONSTRAINT "exam_course_packets_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "exam_course_packets" ecp SET "universityId" = c."universityId" FROM "courses" c WHERE ecp."courseId" = c."id" AND ecp."universityId" IS NULL;
--> statement-breakpoint
UPDATE "exam_course_packets" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۸. حقوق و پرداخت اساتید
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "teaching_rates" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "teaching_rates" ADD CONSTRAINT "teaching_rates_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "teaching_rates" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "teaching_coefficients" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "teaching_coefficients" ADD CONSTRAINT "teaching_coefficients_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "teaching_coefficients" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "payroll_calculation_rules" ADD CONSTRAINT "payroll_calculation_rules_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "payroll_calculation_rules" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "professor_term_contracts" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "professor_term_contracts" ADD CONSTRAINT "professor_term_contracts_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "professor_term_contracts" ptc SET "universityId" = s."universityId" FROM "staff" s WHERE ptc."staffId" = s."id" AND ptc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "professor_term_contracts" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "payroll_statements" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "payroll_statements" ADD CONSTRAINT "payroll_statements_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "payroll_statements" ps SET "universityId" = ptc."universityId" FROM "professor_term_contracts" ptc WHERE ps."contractId" = ptc."id" AND ps."universityId" IS NULL;
--> statement-breakpoint
UPDATE "payroll_statements" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "instructor_deliveries" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "instructor_deliveries" ADD CONSTRAINT "instructor_deliveries_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "instructor_deliveries" id2 SET "universityId" = s."universityId" FROM "staff" s WHERE id2."instructorId" = s."id" AND id2."universityId" IS NULL;
--> statement-breakpoint
UPDATE "instructor_deliveries" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "instructor_advances" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "instructor_advances" ADD CONSTRAINT "instructor_advances_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "instructor_advances" ia SET "universityId" = s."universityId" FROM "staff" s WHERE ia."instructorId" = s."id" AND ia."universityId" IS NULL;
--> statement-breakpoint
UPDATE "instructor_advances" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "instructor_financial_profiles" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "instructor_financial_profiles" ADD CONSTRAINT "instructor_financial_profiles_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "instructor_financial_profiles" ifp SET "universityId" = s."universityId" FROM "staff" s WHERE ifp."instructorId" = s."id" AND ifp."universityId" IS NULL;
--> statement-breakpoint
UPDATE "instructor_financial_profiles" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "instructor_attendance_days" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "instructor_attendance_days" ADD CONSTRAINT "instructor_attendance_days_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "instructor_attendance_days" iad SET "universityId" = s."universityId" FROM "staff" s WHERE iad."instructorId" = s."id" AND iad."universityId" IS NULL;
--> statement-breakpoint
UPDATE "instructor_attendance_days" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۹. اسناد و مدارک
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "electronic_documents" ed SET "universityId" = s."universityId" FROM "staff" s WHERE ed."staffId" = s."id" AND ed."universityId" IS NULL;
--> statement-breakpoint
UPDATE "electronic_documents" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_documents" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_documents" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_cards" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_cards" ADD CONSTRAINT "student_cards_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_cards" sc SET "universityId" = s."universityId" FROM "students" s WHERE sc."studentId" = s."id" AND sc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_cards" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "document_categories" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "document_categories" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "document_types" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "document_types" ADD CONSTRAINT "document_types_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "document_types" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "document_templates" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۱۰. درخواست‌ها و گردش کار
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_requests" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_requests" sr SET "universityId" = s."universityId" FROM "students" s WHERE sr."studentId" = s."id" AND sr."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_requests" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "request_step_logs" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "request_step_logs" ADD CONSTRAINT "request_step_logs_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "request_step_logs" rsl SET "universityId" = sr."universityId" FROM "student_requests" sr WHERE rsl."requestId" = sr."id" AND rsl."universityId" IS NULL;
--> statement-breakpoint
UPDATE "request_step_logs" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "process_definitions" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "process_definitions" ADD CONSTRAINT "process_definitions_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "process_definitions" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "process_steps" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "process_steps" ps SET "universityId" = pd."universityId" FROM "process_definitions" pd WHERE ps."processId" = pd."id" AND ps."universityId" IS NULL;
--> statement-breakpoint
UPDATE "process_steps" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۱۱. فارغ‌التحصیلی
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "clearance_departments" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "clearance_departments" ADD CONSTRAINT "clearance_departments_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "clearance_departments" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "graduation_audits" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "graduation_audits" ADD CONSTRAINT "graduation_audits_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "graduation_audits" ga SET "universityId" = s."universityId" FROM "students" s WHERE ga."studentId" = s."id" AND ga."universityId" IS NULL;
--> statement-breakpoint
UPDATE "graduation_audits" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "clearance_checklist" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "clearance_checklist" ADD CONSTRAINT "clearance_checklist_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "clearance_checklist" cc SET "universityId" = s."universityId" FROM "students" s WHERE cc."studentId" = s."id" AND cc."universityId" IS NULL;
--> statement-breakpoint
UPDATE "clearance_checklist" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "issued_degrees" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "issued_degrees" ADD CONSTRAINT "issued_degrees_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "issued_degrees" id SET "universityId" = s."universityId" FROM "students" s WHERE id."studentId" = s."id" AND id."universityId" IS NULL;
--> statement-breakpoint
UPDATE "issued_degrees" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alumni_profiles" ADD CONSTRAINT "alumni_profiles_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "alumni_profiles" ap SET "universityId" = s."universityId" FROM "students" s WHERE ap."studentId" = s."id" AND ap."universityId" IS NULL;
--> statement-breakpoint
UPDATE "alumni_profiles" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "alumni_requests" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "alumni_requests" ADD CONSTRAINT "alumni_requests_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "alumni_requests" ar SET "universityId" = s."universityId" FROM "students" s WHERE ar."studentId" = s."id" AND ar."universityId" IS NULL;
--> statement-breakpoint
UPDATE "alumni_requests" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۱۲. حضور کلاسی و کلاس مجازی
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "class_sessions" cs SET "universityId" = co."universityId" FROM "course_offerings" co WHERE cs."offeringId" = co."id" AND cs."universityId" IS NULL;
--> statement-breakpoint
UPDATE "class_sessions" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "student_class_attendance" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "student_class_attendance" ADD CONSTRAINT "student_class_attendance_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "student_class_attendance" sca SET "universityId" = e."universityId" FROM "enrollments" e WHERE sca."enrollmentId" = e."id" AND sca."universityId" IS NULL;
--> statement-breakpoint
UPDATE "student_class_attendance" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "professor_class_attendance" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "professor_class_attendance" ADD CONSTRAINT "professor_class_attendance_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "professor_class_attendance" pca SET "universityId" = s."universityId" FROM "staff" s WHERE pca."staffId" = s."id" AND pca."universityId" IS NULL;
--> statement-breakpoint
UPDATE "professor_class_attendance" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "virtual_classrooms" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "virtual_classrooms" ADD CONSTRAINT "virtual_classrooms_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "virtual_classrooms" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۱۳. دوره‌های کوتاه‌مدت
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "short_term_courses" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "short_term_courses" ADD CONSTRAINT "short_term_courses_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "short_term_courses" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "short_term_learners" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "short_term_learners" ADD CONSTRAINT "short_term_learners_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "short_term_learners" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "short_term_registrations" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "short_term_registrations" ADD CONSTRAINT "short_term_registrations_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "short_term_registrations" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "short_term_discounts" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "short_term_discounts" ADD CONSTRAINT "short_term_discounts_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "short_term_discounts" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "short_term_certificates" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "short_term_certificates" ADD CONSTRAINT "short_term_certificates_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "short_term_certificates" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

-- ══════════════════════════════════════════════════════════════════════
--  ۱۴. سایر (ارزیابی، اعلان‌ها، سیستم‌تنظیمات)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "evaluation_periods" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "evaluation_periods" ep SET "universityId" = at."universityId" FROM "academic_terms" at WHERE ep."termId" = at."id" AND ep."universityId" IS NULL;
--> statement-breakpoint
UPDATE "evaluation_periods" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "evaluation_forms" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "evaluation_forms" ADD CONSTRAINT "evaluation_forms_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "evaluation_forms" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "military_service_records" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "military_service_records" ADD CONSTRAINT "military_service_records_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "military_service_records" msr SET "universityId" = s."universityId" FROM "students" s WHERE msr."studentId" = s."id" AND msr."universityId" IS NULL;
--> statement-breakpoint
UPDATE "military_service_records" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "kyc_verifications" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "notification_templates" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "system_settings" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "analytics_snapshots" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "legacy_import_batches" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "legacy_import_batches" ADD CONSTRAINT "legacy_import_batches_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "legacy_import_batches" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "legacy_import_rows" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "legacy_import_rows" lir SET "universityId" = lib."universityId" FROM "legacy_import_batches" lib WHERE lir."batchId" = lib."id" AND lir."universityId" IS NULL;
--> statement-breakpoint
UPDATE "legacy_import_rows" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

--> statement-breakpoint
ALTER TABLE "migration_audit_entries" ADD COLUMN IF NOT EXISTS "universityId" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "migration_audit_entries" ADD CONSTRAINT "migration_audit_entries_universityId_universities_id_fk" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "migration_audit_entries" SET "universityId" = (SELECT id FROM "universities" WHERE "code" = 'AFAGH') WHERE "universityId" IS NULL;

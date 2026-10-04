-- ══════════════════════════════════════════════════════════════════════
-- 0045 — منشأ نمرهٔ بین‌دانشگاهی + جدول معادل‌سازی درس
-- ────────────────────────────────────────────────────────────────────────
--  دانشجویان دانشگاه‌های محلی (زرینه/علامه/شمس/نژند) برای گرفتن مدرک به آفاق
--  آمده‌اند؛ گاهی همان شمارهٔ دانشجویی در آفاق هم برایشان ساخته شده است. تا
--  وقتی نگفته باشیم کدام درس از کدام دانشگاه آمده، هیچ ستونی این را نگه
--  نمی‌دارد: originalSamaCode کدِ سما در لحظهٔ ورود است (نه مبدأ)، و
--  offeringType='TRANSFER' در عمل «ارائهٔ تاریخیِ وارداتی» را یعنی (۹۰۸۶ از
--  ۹۰۸۶ ارائهٔ شمس آن را دارند). نتیجه: هر نوشتنی یا GPA را بی‌صدا خراب
--  می‌کند یا در اجرای دوباره تکرار می‌شود.
--
--  این مهاجرت سه چیز اضافه می‌کند:
--   ۱) enrollments.sourceUniversityId / sourceEnrollmentId — مبدأ نمره.
--      sourceEnrollmentId کلید idempotency هم هست: هر نمرهٔ خارجی دقیقاً
--      یک‌بار قابل اعمال است.
--   ۲) یک ایندکس یکتای جزئی روی sourceEnrollmentId.
--   ۳) course_equivalences — تصمیمِ انسانیِ «این درسِ دانشگاه A همان درسِ
--      دانشگاه B است». بدون این جدول، هیچ چیز در اسکیما نمی‌تواند بگوید دو
--      درس از دو دانشگاه هم‌ارز هستند و همه‌چیز روی حدسِ عنوانِ فارسی می‌افتد.
--      جهت A→B است: A مبدأ (معمولاً AFAGH)، B مقصد.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "sourceUniversityId" integer REFERENCES "universities"("id");

--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "sourceEnrollmentId" integer REFERENCES "enrollments"("id");

--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_enrollments_source_not_self') THEN
		-- ردیفِ انتقالی نمی‌تواند مبدأِ خودش باشد (در حلقهٔ ارجاع گرفتار می‌شود)
		ALTER TABLE "enrollments" ADD CONSTRAINT "ck_enrollments_source_not_self"
			CHECK ("sourceEnrollmentId" IS NULL OR "sourceEnrollmentId" <> "id");
	END IF;
END $$;

--> statement-breakpoint
-- یکتاییِ جزئی: هر نمرهٔ خارجی فقط یک‌بار در کل سامانه اعمال می‌شود.
-- برای ستون NULL ایندکس معمولی کافی نبود (NULLs DISTINCT اجازهٔ تکرار می‌داد).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_enrollments_source_enrollment"
	ON "enrollments" ("sourceEnrollmentId") WHERE "sourceEnrollmentId" IS NOT NULL;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrollments_source_university"
	ON "enrollments" ("sourceUniversityId") WHERE "sourceUniversityId" IS NOT NULL;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_equivalences" (
	"id"             serial PRIMARY KEY,
	"universityIdA"  integer NOT NULL REFERENCES "universities"("id"),
	"courseIdA"      integer NOT NULL REFERENCES "courses"("id"),
	"universityIdB"  integer NOT NULL REFERENCES "universities"("id"),
	"courseIdB"      integer NOT NULL REFERENCES "courses"("id"),
	"matchMethod"    varchar(30) NOT NULL,
	"matchScore"     numeric(5,4),
	"confidence"     numeric(4,3),
	"decidedBy"      integer REFERENCES "users"("id"),
	"decidedAt"      timestamptz,
	"rejected"       integer NOT NULL DEFAULT 0,
	"decidedReason"  varchar(200),
	"createdAt"      timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "uq_course_equivalences_pair" UNIQUE ("universityIdA","courseIdA","universityIdB","courseIdB"),
	CONSTRAINT "ck_course_equivalences_cross_university" CHECK ("universityIdA" <> "universityIdB"),
	CONSTRAINT "ck_course_equivalences_distinct_courses" CHECK ("courseIdA" <> "courseIdB"),
	CONSTRAINT "ck_course_equivalences_rejected_needs_reason"
		CHECK ("rejected" = 0 OR ("decidedAt" IS NOT NULL AND "decidedReason" IS NOT NULL))
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_course_equivalences_b"
	ON "course_equivalences" ("universityIdB", "courseIdB");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_course_equivalences_pending"
	ON "course_equivalences" ("universityIdA", "courseIdA") WHERE "decidedAt" IS NULL;

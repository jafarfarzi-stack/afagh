-- ════════════════════════════════════════════════════════════════════════
--  ۰۱۳۷ — مدلِ دوگانهٔ کاتالوگ: عادی (NORMAL) و جبرانی (COMPENSATORY)
--
--  مسئله‌ای که این مهاجرت حل می‌کند:
--  در چارت‌های مهاجرتی، دروسِ «جبرانی» (نقش COMPENSATORY) داخلِ همان نسخهٔ
--  عادی نشسته بودند. نتیجه:
--    ۱) جمع واحد ترم برای دانشجوی عادی باد کرده بود و در ۴۸ ترم از سقف
--       (۲۰ واحد) می‌گذشت؛ در حالی که آن واحدها اصلاً به دانشجوی عادی تعلق
--       ندارد.
--    ۲) موتور آیین‌نامه برای دانشجوی دارای واحد جبرانی، سقف همان ترم را به
--       اندازهٔ students.compensatoryUnits بالا می‌برد — یعنی سقف را برای
--       همان دروسی باز می‌کرد که نباید در کاتالوگ عادی باشند (دورِ منطقی).
--    ۳) هیچ راهی برای انتشارِ مستقلِ «کاتالوگ جبرانی» و نسخه‌بندیِ آن نبود.
--
--  راه‌حل: یک ستونِ catalogKind روی نسخه، به‌همراه ارجاعِ اختیاری
--  compensatoryVersionId از نسخهٔ عادی به نسخهٔ جبرانیِ متناظر. قیدهای
--  یکتایی نیز بازنویسی می‌شوند تا «یک PUBLISHED عادی + یک PUBLISHED جبرانی»
--  برای یک (رشته، مقطع، گرایش) هم‌زمان مجاز باشد.
--
--  سازگاری با دادهٔ موجود: همهٔ نسخه‌های فعلی با DEFAULT = 'NORMAL' می‌مانند؛
--  هیچ ردیفی جابه‌جا یا حذف نمی‌شود. مهاجرت idempotent است.
-- ════════════════════════════════════════════════════════════════════════

-- ── ۱) ستون‌های جدید نسخه ──────────────────────────────────────────────
ALTER TABLE "curriculum_versions"
  ADD COLUMN IF NOT EXISTS "catalogKind" varchar(20) DEFAULT 'NORMAL' NOT NULL;
--> statement-breakpoint

-- ارجاع نسخهٔ عادی به نسخهٔ جبرانیِ متناظر (اختیاری؛ NULL = جبرانیِ جدا ندارد)
ALTER TABLE "curriculum_versions"
  ADD COLUMN IF NOT EXISTS "compensatoryVersionId" integer;
--> statement-breakpoint

-- ── ۲) قید مقدار مجاز ─────────────────────────────────────────────────
ALTER TABLE "curriculum_versions"
  DROP CONSTRAINT IF EXISTS "curriculum_versions_catalog_kind_check";
--> statement-breakpoint
ALTER TABLE "curriculum_versions"
  ADD CONSTRAINT "curriculum_versions_catalog_kind_check"
  CHECK ("catalogKind" IN ('NORMAL','COMPENSATORY'));
--> statement-breakpoint

-- ── ۳) کلید خارجیِ خودارجاع (نسخهٔ عادی ← نسخهٔ جبرانی) ────────────────
ALTER TABLE "curriculum_versions"
  DROP CONSTRAINT IF EXISTS "curriculum_versions_compensatory_version_fk";
--> statement-breakpoint
ALTER TABLE "curriculum_versions"
  ADD CONSTRAINT "curriculum_versions_compensatory_version_fk"
  FOREIGN KEY ("compensatoryVersionId") REFERENCES "curriculum_versions"("id")
  ON DELETE SET NULL;
--> statement-breakpoint

-- ── ۴) بازنویسی قیدهای یکتایی با احتسابِ catalogKind ────────────────────
-- بدون این تغییر، نسخهٔ جبرانی نمی‌توانست همان versionCode را داشته باشد و
-- «یک PUBLISHED» به ازای هر (رشته، مقطع، گرایش) مانع انتشار کاتالوگ جبرانی
-- می‌شد.
DROP INDEX IF EXISTS "uq_curriculum_versions_version_code";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_curriculum_versions_version_code"
  ON "curriculum_versions" USING btree
  ("majorId","degreeLevelId",coalesce("trackId",0),"catalogKind","versionCode");
--> statement-breakpoint

DROP INDEX IF EXISTS "uq_curriculum_versions_published";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_curriculum_versions_published"
  ON "curriculum_versions" USING btree
  ("majorId","degreeLevelId",coalesce("trackId",0),"catalogKind")
  WHERE "status" = 'PUBLISHED';
--> statement-breakpoint

-- ایندکس مسیرِ داغِ Resolution: «نسخهٔ منتشرشدهٔ این رشته/مقطع به تفکیک نوع»
CREATE INDEX IF NOT EXISTS "curriculum_versions_kind_idx"
  ON "curriculum_versions" USING btree ("majorId","catalogKind","status");
--> statement-breakpoint

-- ── ۵) پرچمِ «دانشجو نیازمند درس جبرانی» روی دانشجو ──────────────────────
-- منبع حقیقت همان students.compensatoryUnits است؛ این ستون فقط یک آینهٔ
-- قابلِ کوئری است و با تریگر هم‌گام نگه داشته می‌شود (هرگز واگرا نمی‌شود).
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "needsCompensatory" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

UPDATE "students"
   SET "needsCompensatory" = true
 WHERE "needsCompensatory" = false
   AND coalesce("compensatoryUnits", 0) > 0;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION sync_students_needs_compensatory() RETURNS trigger AS $$
BEGIN
  NEW."needsCompensatory" := (coalesce(NEW."compensatoryUnits", 0) > 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "trg_students_needs_compensatory" ON "students";
--> statement-breakpoint
CREATE TRIGGER "trg_students_needs_compensatory"
  BEFORE INSERT OR UPDATE OF "compensatoryUnits" ON "students"
  FOR EACH ROW EXECUTE FUNCTION sync_students_needs_compensatory();
--> statement-breakpoint

-- ── ۶) راستی‌آزمایی ────────────────────────────────────────────────────
DO $$
DECLARE
  bad_kind integer;
  bad_flag integer;
BEGIN
  SELECT count(*) INTO bad_kind FROM "curriculum_versions"
   WHERE "catalogKind" NOT IN ('NORMAL','COMPENSATORY');
  IF bad_kind > 0 THEN
    RAISE EXCEPTION '۰۱۳۷: % نسخه با catalogKind نامعتبر باقی ماند', bad_kind;
  END IF;

  SELECT count(*) INTO bad_flag FROM "students"
   WHERE "needsCompensatory" <> (coalesce("compensatoryUnits", 0) > 0);
  IF bad_flag > 0 THEN
    RAISE EXCEPTION '۰۱۳۷: % دانشجو با پرچم جبرانیِ ناهم‌گام باقی ماند', bad_flag;
  END IF;
END $$;

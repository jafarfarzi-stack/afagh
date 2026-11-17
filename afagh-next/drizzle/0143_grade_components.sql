-- ══════════════════════════════════════════════════════════════════
-- 0143 — اجزای نمره به‌صورت ستون‌های مستقل در enrollments
--
-- چرا؟
--   جدول ورود نمرات استاد هفت فیلد جزئی دارد (میان‌ترم، پایان‌ترم،
--   تکالیف، حضور، نمرهٔ استاد تئوری، نمرهٔ استاد عملی، بخش عملی) ولی
--   saveGradeAction همهٔ آن‌ها را در یک ستون (gradeValue) می‌نوشت؛
--   پس ثبت میان‌ترم و سپس پایان‌ترم، اولی را بازنویسی می‌کرد و «نمرهٔ
--   نهایی» هر بار همان آخرین مقدار تایپ‌شده بود.
--
--   این مهاجرت فقط ظرفیت ذخیره‌سازیِ افزودنی می‌سازد. هیچ مقدار موجودی
--   خوانده/بازنویسی نمی‌شود و هیچ محاسبه‌ای در خودِ مهاجرت انجام نمی‌گیرد:
--   gradeValue همان تنها مرجع «نمرهٔ نهایی» می‌ماند. اپلیکیشن پس از ثبت هر
--   جزء، نمرهٔ نهایی را از روی همین ستون‌ها با همان تابع calculateFinalScore
--   بازمحاسبه و به‌صورت DRAFT در gradeValue می‌نویسد (هرگز FINALIZED).
--
-- اصول:
--   • idempotent: ADD COLUMN IF NOT EXISTS ⇒ اجرای دوباره no-op است.
--   • غیرمخرب: همهٔ ستون‌ها NULL و بدون DEFAULT هستند؛ هیچ ردیفی
--     بازنویسی نمی‌شود و هیچ قید تازه‌ای روی داده‌های موجود گذاشته نمی‌شود.
--   • numeric(4,2) هم‌اندازهٔ gradeValue (۰ تا ۹۹٫۹۹ با دو رقم اعشار).
-- ══════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "midtermScore" numeric(4,2);

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "finalExamScore" numeric(4,2);

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "homeworkScore" numeric(4,2);

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "participationScore" numeric(4,2);

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "theoryProfScore" numeric(4,2);

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "labProfScore" numeric(4,2);

--> statement-breakpoint
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS "practicalScore" numeric(4,2);

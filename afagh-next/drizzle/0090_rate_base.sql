-- ══════════════════════════════════════════════════════════════════════
-- 0090 — بُعد «پایه» (academicBase) برای جدول نرخ حق‌التدریس
--
-- مسئله (نسخه قدیمی سما): نرخ ساعتی به «مرتبه + پایه» بستگی داشت؛
-- مثلاً مربی پایهٔ ۱ کمتر از مربی پایهٔ ۲ می‌گرفت. در آفاق جدول نرخ فقط
-- مرتبه+مدرک داشت و پایه نادیده گرفته می‌شد.
--
-- راه‌حل: ستون academicBase روی teaching_rates (NULL = همهٔ پایه‌ها).
-- اولویت تطبیق: (مرتبه+مدرک+پایهٔ دقیق) ← (مرتبه+مدرک بدون پایه).
-- سازگار با گذشته: سطرهای قدیمی NULL می‌مانند و مثل قبل اعمال می‌شوند.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "teaching_rates" ADD COLUMN IF NOT EXISTS "academicBase" VARCHAR(20);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rates_rank_degree_base" ON "teaching_rates" ("academicRank", "degree", "academicBase");

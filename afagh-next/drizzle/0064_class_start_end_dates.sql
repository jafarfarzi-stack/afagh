-- ══════════════════════════════════════════════════════════════════════
-- 0064 — شروع/پایان کلاس‌ها در academic_terms
--
-- چرا؟ در تقویم آموزشی، «شروع ترم» با «شروع کلاس‌ها» یکی نیست
-- (ثبت‌نام و ترم از تاریخ X شروع می‌شود ولی کلاس‌ها از تاریخ Y).
-- تولید جلسات (class_sessions) باید بر پایهٔ شروعِ کلاس‌ها باشد نه
-- شروعِ ترم؛ این دو ستون همان بازه را نگه می‌دارند و موتور تولید جلسات
-- از آن‌ها می‌خواند (با fallback به startDate/endDate وقتی خالی‌اند).
-- اجرای مجدد بی‌خطر (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "classStartDate" timestamp;

--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "classEndDate" timestamp;
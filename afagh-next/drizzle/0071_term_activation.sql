-- ══════════════════════════════════════════════════════════════════════
-- 0071 — فعالسازی ترم‌به‌ترم دانشجو (پیگیری)
--
-- student_term_states (هر دانشجو در هر ترم) به‌عنوان ابزارِ فعال‌سازیِ ترم
-- استفاده می‌شود: statusCode='ACTIVE' یعنی «در این ترم فعال است».
-- ردیابی: چه کسی فعال/غیرفعال کرد و کی.
-- گیت انتخاب‌واحد با تنظیم ENFORCE_TERM_ACTIVATION روشن می‌شود.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "activatedByUserId" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "student_term_states" ADD COLUMN IF NOT EXISTS "activatedAt" timestamp;
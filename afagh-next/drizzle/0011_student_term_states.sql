-- ════════════════════════════════════════════════════════════════════════
-- 0011 — وضعیت نیمسال دانشجویان (student_term_states)
-- ────────────────────────────────────────────────────────────────────────
--  چرا لازم است: این جدول در schema.ts تعریف شده و دو جا به آن تکیه شده —
--    ۱) کارنامهٔ مدیر (admin/students → getTranscript) برای نمایش «عنوان وضعیت
--       هر نیمسال + مشروطی» و ۲) سیاست RLS در pg-hardening.sql که SELECT نقش
--       اپ را فقط به نیمسال‌های خود دانشجو محدود می‌کند.
--  اما هیچ مهاجرتی آن را نمی‌ساخت؛ فقط import-sama-afagh.mjs هنگام واردسازی
--  سما آن را به‌صورت ad-hoc می‌ساخت. نتیجه: در استقرار تازه (CI / سرور نو)
--  جدول وجود نداشت → گام hardening با «relation "student_term_states" does not
--  exist» می‌شکست و کل زنجیرهٔ اثبات RLS رد می‌شد.
--  ▸ IF NOT EXISTS: روی دیتابیس‌هایی که جدول را با اسکریپت سما ساخته‌اند بی‌اثر
--    است و ساختار یکسان می‌ماند (همان قید uq_student_term_states).
--  ▸ ایندکس جدا برای ("studentId") لازم نیست: قید یکتایی مرکب همان پیشوند را
--    پوشش می‌دهد و کوئری کارنامه دقیقاً با این پیشوند فیلتر می‌کند.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_term_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "studentId" integer NOT NULL,
  "termId" integer NOT NULL,
  "termCode" varchar(10) NOT NULL,
  "statusCode" varchar(10),
  "statusTitle" varchar(150),
  "isProbation" integer,
  "termAvg" numeric(4, 2),
  CONSTRAINT "uq_student_term_states" UNIQUE ("studentId", "termId"),
  CONSTRAINT "student_term_states_studentId_students_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "student_term_states_termId_academic_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action
);

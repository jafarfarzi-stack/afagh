-- ══════════════════════════════════════════════════════════════════════
-- 0089 — نقش استاد در درس (قابل تنظیم) + بُعد «وضعیت کلاس» برای قوانین
--
-- مسئله (نسخه قدیمی سما): برای «معرفی به استاد» و دروس بدون کلاس، فرمول
-- خاص بر اساس نقش استاد در درس (راهنما/مشاور/داور/ممتحن/مدرس) تعریف می‌شد.
-- در آفاق نقش فقط خودکار بود (اصلی→مدرس، پایان‌نامه→راهنما) و قابل تنظیم نبود.
--
-- راه‌حل:
--  ۱) teaching_role_defs — کاتالوگ نقش‌های قابل تعریف (کمک‌استاد، استاد خودخوان…)
--     با ۵ نقش استاندارد از پیش پرشده؛ نقش جدید = فقط یک سطر جدید.
--  ۲) offering_payroll_extras.payRoleOverride — نقش دستی هر استاد در هر ارائه
--     (NULL = خودکار؛ کد نقش از کاتالوگ بالا می‌آید، نه enum ثابت)
--  ۳) payroll_calculation_rules.classMode — قانون فقط برای دروس «باکلاس» یا
--     «بدون‌کلاس» اعمال شود (ANY | WITH_CLASS | NO_CLASS؛ پیش‌فرض ANY)
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teaching_role_defs" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(50) NOT NULL UNIQUE,
  "title" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "universityId" INTEGER REFERENCES "universities"("id"),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

--> statement-breakpoint
INSERT INTO "teaching_role_defs" ("code", "title", "description") VALUES
  ('MAIN_LECTURER', 'مدرس اصلی', 'تدریس عادی درس — نقش پیش‌فرض ارائه‌های عادی'),
  ('SUPERVISOR', 'استاد راهنما', 'راهنمایی پایان‌نامه/رساله — نقش پیش‌فرض THESIS'),
  ('ADVISOR', 'استاد مشاور', 'مشاوره پایان‌نامه یا درس'),
  ('REVIEWER', 'داور', 'داوری پایان‌نامه/رساله و دروس خودخوان'),
  ('EXAMINER', 'ممتحن', 'برگزاری و تصحیح امتحان بدون تدریس موظف'),
  ('ASSISTANT', 'کمک‌استاد', 'همکاری آموزشی زیر نظر مدرس اصلی (تمرین، رفع اشکال)'),
  ('SELF_STUDY', 'استاد خودخوان', 'هدایت دروس خودخوان/معرفی‌به‌استاد بدون کلاس هفتگی')
ON CONFLICT ("code") DO NOTHING;

--> statement-breakpoint
ALTER TABLE "offering_payroll_extras" ADD COLUMN IF NOT EXISTS "payRoleOverride" VARCHAR(50);

--> statement-breakpoint
ALTER TABLE "payroll_calculation_rules" ADD COLUMN IF NOT EXISTS "classMode" VARCHAR(20) NOT NULL DEFAULT 'ANY';

-- 0010 افزودن ستون‌های کد وضعیت سما به تخصیص درس کاتالوگ (مطابق schema.ts)
-- این ستون‌ها در schema.ts تعریف شده بودند ولی در DB وجود نداشتند؛ در نتیجه
-- resolveSamaGradeStatusCode هرگز نمی‌توانست کد جبرانی (مثل ۱۲) را از کاتالوگ بخواند.
ALTER TABLE "curriculum_courses" ADD COLUMN IF NOT EXISTS "passGradeStatusCode" varchar(10);
ALTER TABLE "curriculum_courses" ADD COLUMN IF NOT EXISTS "failGradeStatusCode" varchar(10);

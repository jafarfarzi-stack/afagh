-- 0014 — کد وضع نمرهٔ سما به‌ازای قبولی/مردودی، مختص هر تخصیص درس در کاتالوگ
-- (schema.ts:curriculum_courses) — چون وضع نهایی به نحوهٔ تعریف درس در همان
-- نسخهٔ کاتالوگ بستگی دارد (مثلاً همان درس در کاتالوگ دیگر به‌عنوان جبرانی
-- ارائه شود)، نه یک قاعدهٔ سراسری. NULL = پیش‌فرض سیستم (کد ۱ قبولی، کد ۲ مردودی).
ALTER TABLE "curriculum_courses" ADD COLUMN IF NOT EXISTS "passGradeStatusCode" varchar(10);
ALTER TABLE "curriculum_courses" ADD COLUMN IF NOT EXISTS "failGradeStatusCode" varchar(10);

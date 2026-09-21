-- افزودن فیلد هم‌ارزی دروس: کدهای دروس هم‌ارز جداشده با کاما
--> statement-breakpoint
ALTER TABLE courses ADD COLUMN IF NOT EXISTS "equivalentCourseCodes" text;

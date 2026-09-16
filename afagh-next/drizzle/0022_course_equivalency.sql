-- افزودن فیلد هم‌ارزی دروس: کدهای دروس هم‌ارز جداشده با کاما
ALTER TABLE courses ADD COLUMN "equivalentCourseCodes" text;

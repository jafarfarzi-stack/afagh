-- ═══════════════════════════════════════════════════════════════════
--  اضافه شدن فیلدهای جدید سما به جدول courses
--  ماهیت درس، نام انگلیسی، توضیحات، ساعت هفتگی، پایان‌نامه، پروژه، کارآموزی
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "courses" ADD COLUMN "courseNature" varchar(50);
ALTER TABLE "courses" ADD COLUMN "englishName" varchar(200);
ALTER TABLE "courses" ADD COLUMN "description" text;
ALTER TABLE "courses" ADD COLUMN "weeklyTheoryHours" numeric(3, 1);
ALTER TABLE "courses" ADD COLUMN "weeklyPracticalHours" numeric(3, 1);
ALTER TABLE "courses" ADD COLUMN "isThesis" integer DEFAULT 0;
ALTER TABLE "courses" ADD COLUMN "hasProject" integer DEFAULT 0;
ALTER TABLE "courses" ADD COLUMN "internshipUnits" numeric(3, 1) DEFAULT '0';
ALTER TABLE "courses" ADD COLUMN "minPassedMark" numeric(4, 2);
ALTER TABLE "courses" ADD COLUMN "defaultAcceptMarkState" varchar(10);
ALTER TABLE "courses" ADD COLUMN "defaultRejectMarkState" varchar(10);

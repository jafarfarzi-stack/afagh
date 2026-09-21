-- ═══════════════════════════════════════════════════════════════════
--  اضافه شدن فیلدهای جدید سما به جدول courses
--  ماهیت درس، نام انگلیسی، توضیحات، ساعت هفتگی، پایان‌نامه، پروژه، کارآموزی
-- ═══════════════════════════════════════════════════════════════════

--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "courseNature" varchar(50);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "englishName" varchar(200);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "weeklyTheoryHours" numeric(3, 1);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "weeklyPracticalHours" numeric(3, 1);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "isThesis" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "hasProject" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "internshipUnits" numeric(3, 1) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "minPassedMark" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "defaultAcceptMarkState" varchar(10);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "defaultRejectMarkState" varchar(10);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "courseIsActive" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "emergencyWithdrawal" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "coRequisites" varchar(200);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "facesHours" numeric(3, 1);

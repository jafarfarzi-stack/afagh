-- 0101 — پرچم‌ها و مهرهای زمانی جلسهٔ کلاس
--
-- فرم قدیم «انتخاب درس و برنامه هفتگی» این ستون‌ها را داشت و جای خالی‌شان در
-- سامانه حس می‌شد:
--   ▸ تعطیل        → جلسه به‌خاطر تعطیلی رسمی/اتفاقی برگزار نشده (جدا از غیبت استاد)
--   ▸ فوق‌برنامه   → جلسهٔ اضافه بیرون از ۱۶ جلسهٔ استاندارد
--   ▸ فعال         → جلسهٔ لغوشده/منقضی از فهرست عملیاتی کنار گذاشته شود
--   ▸ تاریخ ایجاد / تاریخ مشاهده توسط استاد / آخرین تغییر → ممیزی جلسه
--
-- همهٔ ستون‌ها additive و با پیش‌فرض‌های بی‌خطر اضافه می‌شوند؛ ردیف‌های موجود
-- «فعال، غیرتعطیل، غیرفوق‌برنامه» می‌مانند و createdAt از خود ردیف‌ها پر می‌شود.

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "isHoliday" integer NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "isExtraSession" integer NOT NULL DEFAULT 0;

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "isActive" integer NOT NULL DEFAULT 1;

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT now();

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "professorViewedAt" timestamp;

--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now();

--> statement-breakpoint
UPDATE "class_sessions" SET "createdAt" = now() WHERE "createdAt" IS NULL;

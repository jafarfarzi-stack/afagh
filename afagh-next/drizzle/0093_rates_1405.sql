-- ══════════════════════════════════════════════════════════════════════
-- 0093 — نرخ مصوب حق‌التدریس سال ۱۴۰۵ (مرتبه × مدرک × پایه)
-- ══════════════════════════════════════════════════════════════════════
--  نرخ هیئت امنا به ازای هر «واحد معادل تدریس» و معادل ساعتی آن:
--    · مربی      (کارشناسی ارشد)          ۲۵٬۰۰۰٬۰۰۰  →  ۱٬۵۶۲٬۵۰۰ / ساعت
--    · استادیار  (دکتری تخصصی Ph.D.)     ۳۸٬۰۰۰٬۰۰۰  →  ۲٬۳۷۵٬۰۰۰ / ساعت
--    · دانشیار   (دکتری تخصصی Ph.D.)     ۴۹٬۰۰۰٬۰۰۰  →  ۳٬۰۶۲٬۵۰۰ / ساعت
--    · استاد تمام (دکتری تخصصی Ph.D.)     ۶۲٬۰۰۰٬۰۰۰  →  ۴٬۰۰۰٬۰۰۰ / ساعت
--
--  ساختار سطرها: یک سطر عمومی (academicBase = NULL) که مبنای مصوب است
--  + یک سطر پایه‌دار برای هر مرتبه با همان مبلغ (پایهٔ ۱) تا وقتی هیئت
--  امنا برای پایه‌های ۲/۳ مصوب جداگانه تصویب کرد، تفکیک «پایه» در موتور
--  (مهاجرت ۰۰۹۰) فعال و قابل استفاده باشد ولی نرخ را نشکند.
--  ── قاعده: سطرِ پایه‌دار بر سطرِ عمومی غلبه دارد (payroll-engine.ts) ──

--> statement-breakpoint
-- پاک‌سازی نرخ‌های ۱۴۰۵ قبلی تا seed تکراری ایجاد نشود
DELETE FROM "teaching_rates" WHERE "effectiveYear" = 1405;

--> statement-breakpoint
-- ── مربی (کارشناسی ارشد) ──
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('مربی', 'کارشناسی ارشد', NULL, 25000000, 1405, NULL);

--> statement-breakpoint
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('مربی', 'کارشناسی ارشد', '1', 25000000, 1405, NULL);

--> statement-breakpoint
-- ── استادیار (دکتری تخصصی) ──
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('استادیار', 'دکتری تخصصی (Ph.D.)', NULL, 38000000, 1405, NULL);

--> statement-breakpoint
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('استادیار', 'دکتری تخصصی (Ph.D.)', '1', 38000000, 1405, NULL);

--> statement-breakpoint
-- ── دانشیار (دکتری تخصصی) ──
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('دانشیار', 'دکتری تخصصی (Ph.D.)', NULL, 49000000, 1405, NULL);

--> statement-breakpoint
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('دانشیار', 'دکتری تخصصی (Ph.D.)', '1', 49000000, 1405, NULL);

--> statement-breakpoint
-- ── استاد تمام (دکتری تخصصی) ──
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('استاد تمام', 'دکتری تخصصی (Ph.D.)', NULL, 62000000, 1405, NULL);

--> statement-breakpoint
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('استاد تمام', 'دکتری تخصصی (Ph.D.)', '1', 62000000, 1405, NULL);

--> statement-breakpoint
-- ── نقش‌های مدعو/همکار: نرخ ساعتیِ استاد تمام به‌عنوان سقف پیش‌فرض ──
-- (مرتبه/مدرک NULL ⇒ فقط وقتی استاد هیچ مرتبه‌ای ندارد اعمال می‌شود؛
--  سطرهای مرتبه‌دار بر این سطر غلبه دارند چون در payroll-engine.ts
--  فیلتر rank با Equality انجام می‌شود و NULL ≠ هیچ‌کدام از مراتب)
INSERT INTO "teaching_rates" ("academicRank", "degree", "academicBase", "baseRatePerUnit", "effectiveYear", "universityId")
VALUES ('استاد مدعو', 'دکتری تخصصی (Ph.D.)', NULL, 62000000, 1405, NULL);

-- 0096 — ستون entryTermId برای نسخهٔ برنامهِ درسی (چارت)
-- چارت ممکن است برای یک رشته در دو نیمسال متفاوت باشد؛ این ستون نگه می‌دارد
-- کدام نیمسال ورودی این نسخهٔ چارت برای آن قابل اعمال است.
-- NULL یعنی برای همه نیمسال‌های ورودی قابل اعمال است.

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD COLUMN "entryTermId" integer;

--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_entryTermId_fkey" FOREIGN KEY ("entryTermId") REFERENCES "financial_terms"("id");

-- 0094 — وضعیت APPLIED برای درخواست بازگشایی نمره
--
-- نمرهٔ FINALIZED پیش از این قفل نبود. برای اینکه «تأیید بازگشایی» یک بار
-- مصرف شود (نه اینکه یک مجوز دائمی برای نوشتن نمره باشد)، درخواست تأییدشده
-- پس از اولین نوشتن به وضعیت APPLIED می‌رود.
--
-- ستون status از varchar(20) است و CHECK ندارد؛ این مایگریشن فقط قید را
-- اضافه می‌کند تا وضعیت‌های ناشناخته در آینده وارد نشوند.

--> statement-breakpoint
ALTER TABLE "grade_unfinalize_requests" DROP CONSTRAINT IF EXISTS "ck_unfinalize_status";
--> statement-breakpoint
ALTER TABLE "grade_unfinalize_requests" ADD CONSTRAINT "ck_unfinalize_status"
  CHECK ("status" IN ('PENDING','REVIEWED','APPROVED','REJECTED','APPLIED'));
--> statement-breakpoint
-- ایندکس کمکی: پیدا کردن سریع درخواست تأییدشدهٔ یک ارائه
CREATE INDEX IF NOT EXISTS "idx_unfinalize_offering_status"
  ON "grade_unfinalize_requests" ("offeringId", "status");

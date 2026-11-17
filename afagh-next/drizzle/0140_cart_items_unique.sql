-- 0140 — cart_items: unique (studentId, offeringId)
--
-- چرا: کد «افزودن به سبد» از `INSERT ... ON CONFLICT ("studentId","offeringId")`
-- استفاده می‌کند ولی هیچ قید یکتایی متناظر روی جدول وجود نداشت؛ PostgreSQL
-- خطای 42P10 می‌دهد و افزودن به سبد در عمل شکست می‌خورد.
-- بررسی تولید (۱۴۰۵/۰۸/۲۶): هیچ ردیف تکراری وجود نداشت، پس ساخت ایندکس امن است.
--
-- توجه: در تولید این ایندکس به‌صورت CONCURRENTLY ساخته شد؛ drizzle فایل را در
-- یک تراکنش اجرا می‌کند، بنابراین نسخهٔ فایل بدون CONCURRENTLY است.

CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_student_offering
  ON cart_items ("studentId", "offeringId");

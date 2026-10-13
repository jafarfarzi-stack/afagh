-- ════════════════════════════════════════════════════════════════════════
-- 0082 — «کنترل زمانی دقیق ثبت مالی» (Accounting Period Lock)
-- ────────────────────────────────────────────────────────────────────────
--  بازسازی قابلیت سیستم قدیم: ثبت مالی فقط داخل «پنجرهٔ دورهٔ مالی باز»
--  مجاز است. مدیر مالی بازهٔ opens_at تا closes_at را تعیین و با is_locked
--  دستی قفل می‌کند. اِعمالِ آن با helper کتابخانه‌ای:
--    src/lib/finance-time-control.ts → assertEntryAllowed()
--  (کمکی‌های ثبت مالی در actions/*.ts آن را صدا می‌زنند.)
--
--  تعاریف ماژول در: src/db/schema-timecontrol.ts (جدول مستقل — خارج از schema.ts)
--
--  ▸ idempotent: IF NOT EXISTS همه‌جا.
--  ▸ نام ستون‌ها snake_case طبق مشخصات این ماژول؛ timestamptz برای حذف
--    ابهام منطقهٔ زمانی سرور در مرزهای دوره.
--  ▸ «تنها یک دورهٔ فعال»: آخرین ردیف ثبت‌شده (id بزرگ‌تر) ملاک است؛ نیازی
--    به unique نیست.
-- ════════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_periods" (
  "id" serial PRIMARY KEY NOT NULL,
  "period_name" text,
  "opens_at" timestamptz NOT NULL,
  "closes_at" timestamptz NOT NULL,
  "is_locked" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounting_periods_opens_at" ON "accounting_periods" ("opens_at");

-- ═══════════════════════════════════════════════════════════════════════
--  فاز ۵ — مهاجرت PII (افزودنی / proposed)
--
--  ⚠ این فایل یک پیشنهاد است. src/db/schema.ts و drizzle/** متعلق به جلسهٔ
--  دیگری است. این SQL را جلسهٔ دیگر باید در یک مهاجرت Drizzle (drizzle/00xx_*.sql)
--  ادغام کند و سپس schema.ts را به‌روز کند. تا آن زمان، فقط به‌صورت مستند و
--  اجرا-نشده نگه داشته شود.
--
--  الگو برای هر ستون کد ملی:
--    <col>Enc        text  — پاکت AES-256-GCM (v1:iv:tag:data) از src/lib/pii.ts
--    <col>BlindIndex text  — شاخص کور HMAC-SHA256 (۶۴ hex) برای جست‌وجوی برابری
--
--  context در blindIndex به‌ازای هر جدول/ستون ثابت می‌ماند (مثلاً 'users.nationalCode').
--  تغییر context یعنی بی‌اعتبار شدن همهٔ شاخص‌های آن ستون.
--
--  ⚠ پس از اجرای این مهاجرت، backfill را با backfill-pii.mjs انجام دهید.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- ۱) persons.canonicalNationalCode
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "canonicalNationalCodeEnc" text,
  ADD COLUMN IF NOT EXISTS "canonicalNationalCodeBlindIndex" text;

-- شاخص کور یکتا (ردیف‌های NULL مستثنا می‌مانند):
CREATE UNIQUE INDEX IF NOT EXISTS "uq_persons_nc_blind"
  ON "persons" ("canonicalNationalCodeBlindIndex")
  WHERE "canonicalNationalCodeBlindIndex" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- ۲) person_source_identities.sourceNationalCode
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "person_source_identities"
  ADD COLUMN IF NOT EXISTS "sourceNationalCodeEnc" text,
  ADD COLUMN IF NOT EXISTS "sourceNationalCodeBlindIndex" text;

CREATE INDEX IF NOT EXISTS "idx_psi_source_nc_blind"
  ON "person_source_identities" ("sourceNationalCodeBlindIndex");

-- ─────────────────────────────────────────────────────────────────────────
-- ۳) identity_resolution_reviews.sourceNationalCode / candidateNationalCode
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "identity_resolution_reviews"
  ADD COLUMN IF NOT EXISTS "sourceNationalCodeEnc" text,
  ADD COLUMN IF NOT EXISTS "sourceNationalCodeBlindIndex" text,
  ADD COLUMN IF NOT EXISTS "candidateNationalCodeEnc" text,
  ADD COLUMN IF NOT EXISTS "candidateNationalCodeBlindIndex" text;

-- ─────────────────────────────────────────────────────────────────────────
-- ۴) users.nationalCode (NOT NULL در ستون اصلی — Enc nullable تا backfill)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "nationalCodeEnc" text,
  ADD COLUMN IF NOT EXISTS "nationalCodeBlindIndex" text;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_nc_blind"
  ON "users" ("nationalCodeBlindIndex", "universityId")
  WHERE "nationalCodeBlindIndex" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- ۵) admissions_staging.nationalCode
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "admissions_staging"
  ADD COLUMN IF NOT EXISTS "nationalCodeEnc" text,
  ADD COLUMN IF NOT EXISTS "nationalCodeBlindIndex" text;

CREATE INDEX IF NOT EXISTS "idx_adm_stg_nc_blind"
  ON "admissions_staging" ("nationalCodeBlindIndex");

-- ═══════════════════════════════════════════════════════════════════════
-- گام نهایی (فقط پس از backfill کامل و تأیید پشتیبان):
--   ALTER TABLE ... DROP COLUMN "nationalCode";   -- و بقیه ستون‌های متن ساده
-- این مرحله عمداً در این فایل نیست؛ باید در یک مهاجرت جدا و پس از بازبینی
-- انجام شود.
-- ═══════════════════════════════════════════════════════════════════════

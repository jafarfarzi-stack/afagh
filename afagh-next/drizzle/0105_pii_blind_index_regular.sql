-- 0105: make PII blind-index columns non-unique (allow legitimate duplicate national codes within a university).
-- 0104 created these as UNIQUE, which broke the backfill for 44 rows where the same national code appears for
-- multiple users in the same university (the original uq_users_nc_uni is not actually enforced in prod).
-- Safe stage: keep plaintext + Enc + BlindIndex; do not wire read/write code yet.

DROP INDEX IF EXISTS "uq_persons_nc_blind";
DROP INDEX IF EXISTS "uq_users_nc_blind";

CREATE INDEX IF NOT EXISTS "idx_persons_nc_blind"
  ON "persons" ("canonicalNationalCodeBlindIndex");

CREATE INDEX IF NOT EXISTS "idx_users_nc_blind"
  ON "users" ("nationalCodeBlindIndex", "universityId");

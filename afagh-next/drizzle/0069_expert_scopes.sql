-- ══════════════════════════════════════════════════════════════════════
-- 0069 — دامنهٔ دسترسی کارشناسان آموزش (expert_scopes)
--
-- به کارشناس (نقش EDU_EXPERT) می‌توان دامنهٔ محدود داد:
--   UNIVERSITY | FACULTY | DEPARTMENT | MAJOR
-- هر سطر = یک محدودهٔ مجاز. اگر برای نقش/کاربر ردیفی نباشد → تمام دانشگاه.
-- اعمال در ماژول ثبت‌نام دستی و بخش‌های دانشجو/استادِ کارشناس.
-- ══════════════════════════════════════════════════════════════════════

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expert_scopes" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scopeType" varchar(20) NOT NULL,                 -- UNIVERSITY | FACULTY | DEPARTMENT | MAJOR
  "scopeId" integer,                                -- id فیزیکی دانشکده/گروه/رشته (UNIVERSITY → universityId زیر)
  "universityId" integer REFERENCES "universities"("id"),
  "createdAt" timestamp DEFAULT now(),
  CONSTRAINT "uq_expert_scopes" UNIQUE ("userId", "scopeType", "scopeId", "universityId")
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_expert_scopes_user ON "expert_scopes"("userId");
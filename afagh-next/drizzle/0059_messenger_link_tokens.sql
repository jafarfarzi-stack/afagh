-- 0059_messenger_link_tokens.sql
-- اتصال امن پیام‌رسان با توکن (بدون رمز عبور در چت) + آفست poll بله/ایتا.
-- idempotent: همهٔ آبجکت‌ها با IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "messenger_link_tokens" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" VARCHAR(20) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "pendingChatId" VARCHAR(64),
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt" TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "ix_messenger_link_tokens_token" ON "messenger_link_tokens" ("tokenHash");
CREATE INDEX IF NOT EXISTS "ix_messenger_link_tokens_user" ON "messenger_link_tokens" ("userId");

CREATE TABLE IF NOT EXISTS "messenger_poll_offsets" (
  "channel" VARCHAR(20) PRIMARY KEY,
  "offset" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

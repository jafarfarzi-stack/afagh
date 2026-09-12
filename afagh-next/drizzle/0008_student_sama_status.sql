-- 0008 — نگهداری کد خام وضعیت سما برای رهگیری و بازنگاشت دقیق
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "samaStatusCode" varchar(10);
CREATE INDEX IF NOT EXISTS "students_status_idx" ON "students" ("status");
CREATE INDEX IF NOT EXISTS "students_entryYear_idx" ON "students" ("entryYear");
CREATE INDEX IF NOT EXISTS "students_majorId_idx" ON "students" ("majorId");

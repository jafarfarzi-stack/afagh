-- 0010 سهم واحد مقرر هر نقش در هر نسخه (قابل تنظیم از تب بررسی و خاتمه)
ALTER TABLE "curriculum_versions" ADD COLUMN IF NOT EXISTS "minRoleUnits" text;

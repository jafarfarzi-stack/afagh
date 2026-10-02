-- Add emergencyWithdrawal field to enrollments table
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "emergencyWithdrawal" integer DEFAULT 0;
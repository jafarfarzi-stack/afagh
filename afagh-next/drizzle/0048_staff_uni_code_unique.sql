--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "uq_staff_uni_code";

--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "uq_staff_uni_code" UNIQUE ("universityId", "staffCode");

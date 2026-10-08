--> statement-breakpoint
UPDATE schedules SET "dayOfWeek" = "dayOfWeek" - 1 WHERE "dayOfWeek" BETWEEN 1 AND 7 AND NOT EXISTS (SELECT 1 FROM schedules WHERE "dayOfWeek" = 0);

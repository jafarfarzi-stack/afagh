-- 0106: add floor (طبقه) to classrooms so the door-sign poster can show
-- building + floor from the room's own data (user request R-AA).
-- Nullable; no backfill required.

ALTER TABLE "classrooms" ADD COLUMN "floor" varchar(20);

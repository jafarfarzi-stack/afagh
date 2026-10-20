-- 0107: add isActive flag to classrooms. Only active rooms appear in the
-- door-sign room selector by default (user request R-AA); inactive rooms can
-- be toggled back on from the management panel.
-- Existing rows default to 1 (active).

ALTER TABLE "classrooms" ADD COLUMN "isActive" integer NOT NULL DEFAULT 1;

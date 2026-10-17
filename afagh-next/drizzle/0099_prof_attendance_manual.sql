-- 0099 — حضور دستی استاد + حضور مراقب/استاد در جلسهٔ امتحان
--
-- ۱) اثر انگشت خودکار از گیت خوانده می‌شود، ولی کارشناس آموزش گاهی باید حضور
--    استاد را برای همان جلسه دستی تأیید کند (خرابی دستگاه، ورود از درِ دیگر،
--    مأموریت). این دو ستون دلیل و هویت تأییدکننده را قابل‌ممیزی می‌کند.
-- ۲) حضور مراقب و استادِ درس در جلسهٔ امتحان باید ثبت شود؛ مدل آن اینجا ساخته
--    می‌شود (به‌ازای هر جلسه × هر نفر، با روش ثبت و تأییدکننده).

--> statement-breakpoint
ALTER TABLE "professor_class_attendance" ADD COLUMN IF NOT EXISTS "note" varchar(300);

--> statement-breakpoint
ALTER TABLE "professor_class_attendance" ADD COLUMN IF NOT EXISTS "confirmedByStaffId" integer;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_session_staff_attendance" (
  "id" serial PRIMARY KEY,
  "sessionId" integer NOT NULL REFERENCES "exam_sessions"("id"),
  "hallId" integer REFERENCES "exam_halls"("id"),
  "staffId" integer NOT NULL REFERENCES "staff"("id"),
  "role" varchar(30) NOT NULL,
  "isPresent" integer NOT NULL DEFAULT 0,
  "method" varchar(30),
  "confirmedByStaffId" integer,
  "note" varchar(300),
  "recordedAt" timestamp DEFAULT now(),
  "universityId" integer REFERENCES "universities"("id")
);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_session_staff_attendance"
  ON "exam_session_staff_attendance" ("sessionId", "staffId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_session_staff_attendance_session"
  ON "exam_session_staff_attendance" ("sessionId", "role");

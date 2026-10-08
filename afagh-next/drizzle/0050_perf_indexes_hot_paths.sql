--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_class_sessions_offering" ON "class_sessions" USING btree ("offeringId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offerings_term_professor" ON "course_offerings" USING btree ("termId", "professorId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_grade_appeals_enrollment" ON "grade_appeals" USING btree ("enrollmentId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prof_attendance_session_staff" ON "professor_class_attendance" USING btree ("sessionId", "staffId");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_academic_terms_uni_id" ON "academic_terms" USING btree ("universityId", "id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_schedules_room_day" ON "schedules" USING btree ("roomId", "dayOfWeek");

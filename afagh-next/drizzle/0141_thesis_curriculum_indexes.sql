-- 0141 — ایندکس‌های تحصیلات تکمیلی، برنامه‌ریزی درسی و اسناد
--
-- همهٔ این ایندکس‌ها در تولید به‌صورت CONCURRENTLY ساخته شده‌اند
-- (۱۴۰۵/۰۸/۲۶)؛ نسخهٔ فایلی برای تکرارپذیری در محیط‌های دیگر است و
-- چون IF NOT EXISTS دارند، در تولید no-op است.

CREATE INDEX IF NOT EXISTS idx_clearance_checklist_audit
  ON clearance_checklist ("auditId");

CREATE INDEX IF NOT EXISTS idx_defense_sessions_student
  ON defense_sessions ("studentId");

CREATE INDEX IF NOT EXISTS idx_graduation_audits_uni_status_event
  ON graduation_audits ("universityId", "workflowStatus", "lastEventAt" DESC);

CREATE INDEX IF NOT EXISTS idx_thesis_progress_uni_updated
  ON thesis_progress ("universityId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_course_rules_syllabus
  ON course_rules ("syllabusId");

CREATE INDEX IF NOT EXISTS idx_curriculum_courses_course
  ON curriculum_courses ("courseId") INCLUDE ("curriculumVersionId", "recommendedSemester");

CREATE INDEX IF NOT EXISTS idx_student_documents_person
  ON student_documents ("personUserId", id DESC);

CREATE INDEX IF NOT EXISTS idx_students_status_active
  ON students (status) WHERE status IN ('ACTIVE', 'PENDING_GRADUATION');

-- 0031 — ایندکس‌های کارایی بارگذاری (کارنامه legacy_grades + فهرست دانشجویان)
--  • legacy_grades: هیچ ایندکسی روی studentCode نبود → هر کارنامه/دروس حذف‌شده
--    کل ۶۰۰هزار ردیف را seq scan می‌کرد (~۲۵۰ms). سه‌ستونه دقیقاً join کارنامه است.
--  • students: ایندکس (universityId, status) برای شمارش وضعیت‌ها در محدودهٔ دانشگاه جاری.
--  • staff: ایندکس universityId برای فیلتر فهرست اساتید/پرسنل هر دانشگاه.
CREATE INDEX IF NOT EXISTS "idx_legacy_grades_student" ON "legacy_grades" USING btree ("studentCode", "termCode", "courseCode");
CREATE INDEX IF NOT EXISTS "idx_students_uni_status" ON "students" USING btree ("universityId", "status");
CREATE INDEX IF NOT EXISTS "idx_staff_uni" ON "staff" USING btree ("universityId");
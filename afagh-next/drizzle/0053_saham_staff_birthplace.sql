-- 0053_saham_staff_birthplace.sql
-- بک‌فیل شهر/استان تولد اساتید برای گزارش آموزشگران سهام + ایندکس تاریخ فراغت.
-- منبع: users.placeOfBirth (۱۱۰۴ از ۱۳۸۲ استاد پر است) + geo_cities (الگوی مهاجرت ۰۰۵۲).
-- idempotent: فقط خانه‌های خالی.

UPDATE staff st SET "birthCity" = m.title
FROM users u
JOIN LATERAL (
  SELECT n.title FROM (
    SELECT c.title, fa_norm(c.title) AS ntitle
    FROM geo_cities c
    WHERE c.title <> 'نامشخص' AND c."provinceCode" <> '0'
  ) n
  WHERE n.ntitle = fa_norm(u."placeOfBirth")
  ORDER BY 1 LIMIT 1
) m ON TRUE
WHERE u.id = st."userId"
  AND (st."birthCity" IS NULL OR st."birthCity" = '')
  AND fa_norm(u."placeOfBirth") <> '';

UPDATE staff st SET "birthProvince" = p.title
FROM geo_cities c JOIN geo_provinces p ON p.code = c."provinceCode"
WHERE c.title = st."birthCity"
  AND (st."birthProvince" IS NULL OR st."birthProvince" = '');

-- ایندکس بازهٔ تاریخ فراغت (گزارش دانش‌آموختگان در بازهٔ خاص)
CREATE INDEX IF NOT EXISTS idx_students_graduateDate ON students ("graduateDate");
CREATE INDEX IF NOT EXISTS idx_offerings_professor_term ON course_offerings ("professorId", "termId") WHERE "professorId" IS NOT NULL;

-- 0052_saham_birthplace_backfill.sql
-- بک‌فیل شهر/استان تولد و سکونت دانشجویان برای گزارش سهام.
-- منبع‌ها (تأییدشده روی دادهٔ واقعی سرور):
--   · شهر تولد ← users.placeOfBirth (۱۸هزار رکورد پر، عنوان شهر به فارسی)
--   · استان تولد ← geo_cities.provinceCode → geo_provinces.title
--                  (دو جدول قدیمی استان3/شهر که از قبل در geo سید شده‌اند؛
--                   ۴۸۵ شهر، همه دارای استان، ۰ یتیم)
--   · شهر/استان سکونت ← users.address (۳۵هزار رکورد) با تطبیق توکنی نام شهر
-- اسکریپت idempotent است: فقط خانه‌های خالی پر می‌شوند.

CREATE OR REPLACE FUNCTION fa_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    replace(replace(replace(replace(replace(trim(coalesce(t, '')), 'ي', 'ی'), 'ك', 'ک'), 'ة', 'ه'), '.', ''), '-', ''),
    '\s+', ' ', 'g')
$$;

-- جدول کمکی نرمال‌شده (بدون «نامشخص» و استان ۰ که در geo تکرارهای فیک دارند)
CREATE TEMP TABLE _city_norm AS
SELECT c.title AS title, c."provinceCode" AS "provinceCode", p.title AS "ptitle",
       fa_norm(c.title) AS ntitle
FROM geo_cities c JOIN geo_provinces p ON p.code = c."provinceCode"
WHERE c.title <> 'نامشخص' AND c."provinceCode" <> '0';

-- ۱) شهر تولد (عنوان استاندارد geo) از users.placeOfBirth
UPDATE students s SET "birthCity" = m.title
FROM users u
JOIN LATERAL (
  SELECT n.title FROM _city_norm n
  WHERE n.ntitle = fa_norm(u."placeOfBirth")
  ORDER BY n."provinceCode" LIMIT 1
) m ON TRUE
WHERE u.id = s."userId"
  AND (s."birthCity" IS NULL OR s."birthCity" = '')
  AND fa_norm(u."placeOfBirth") <> '';

-- ۲) استان تولد از روی شهر تولد
UPDATE students s SET "birthProvince" = n.ptitle
FROM _city_norm n
WHERE n.title = s."birthCity"
  AND (s."birthProvince" IS NULL OR s."birthProvince" = '');

-- ۳) شهر و استان سکونت از users.address (تطبیق توکنی؛ طولانی‌ترین نام شهر برنده)
UPDATE students s SET "residenceCity" = m.title, "residenceProvince" = m.ptitle
FROM users u
JOIN LATERAL (
  SELECT n.title, n.ptitle FROM _city_norm n
  WHERE (' ' || fa_norm(u.address) || ' ') LIKE ('% ' || n.ntitle || ' %')
  ORDER BY length(n.ntitle) DESC LIMIT 1
) m ON TRUE
WHERE u.id = s."userId"
  AND (s."residenceCity" IS NULL OR s."residenceCity" = '')
  AND length(fa_norm(u.address)) >= 3;

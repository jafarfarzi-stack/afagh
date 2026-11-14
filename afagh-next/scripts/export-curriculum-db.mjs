// خروجی کامل چارت‌ها از دیتابیس به TSV (برای ساخت اکسل نهایی)
// ستون‌ها: کد رشته \t کد مقطع \t از ورودی \t تا ورودی \t کد درس \t واحد \t ترم \t نقش \t الزامی \t نوع کاتالوگ
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const req = createRequire(import.meta.url);
const { Pool } = req('pg');
const OUT = process.argv[2] || '/tmp/curriculum-export.tsv';
const UNI = Number(process.argv[3] || 1);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const rows = await q(
  `SELECT m."majorCode" AS mc, m.name AS mn, v."degreeLevelId" AS deg,
          v."entryYearFrom" AS f, v."entryYearTo" AS o,
          c2.code AS lesson, cc.units, cc."recommendedSemester" AS sem,
          cc."roleType" AS role, cc."isRequired" AS req,
          (right(v."versionCode",2)='-C') AS comp,
          v."versionCode" AS vc, v.title
     FROM curriculum_versions v
     JOIN majors m ON m.id = v."majorId"
     JOIN curriculum_courses cc ON cc."curriculumVersionId" = v.id
     JOIN courses c2 ON c2.id = cc."courseId"
    WHERE v."universityId" = $1
    ORDER BY m."majorCode", v."entryYearFrom", v."versionCode", c2.code`, [UNI]);

const ROLE_FA = {
  CORE: 'پایه', MAJOR: 'اصلی', SPECIALIZED: 'تخصصی', ELECTIVE: 'اختیاری',
  GENERAL: 'عمومی', THESIS: 'پایان‌نامه', INTERNSHIP: 'کارآموزی',
  WORKSHOP: 'کارگاه', COMPENSATORY: 'جبرانی',
};
const s = (v) => (v == null ? '' : String(v));

const lines = rows.map((r) => [
  s(r.mc), s(r.deg), s(r.f), s(r.o), s(r.lesson), s(r.units),
  s(r.sem), ROLE_FA[r.role] || s(r.role), Number(r.req) === 1 ? 'بله' : 'خیر',
  r.comp ? 'جبرانی' : 'چارت',
].join('\t'));

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
const vs = await q(
  `SELECT count(*)::int AS n, count(*) FILTER (WHERE right("versionCode",2)='-C')::int AS comp
     FROM curriculum_versions WHERE "universityId"=$1`, [UNI]);
console.log(`versions: ${vs[0].n} (جبرانی: ${vs[0].comp}) | rows: ${lines.length} -> ${OUT}`);
await pool.end();

// تست قرارداد: ورود مجدد چارت با ترم پیشنهادی باید ردیف موجود را به‌روزرسانی کند
// (نه اینکه با onConflictDoNothing بی‌صدا رد شود). PGlite واقعی + هلپر خالص.
// engine.ts به‌واسطهٔ وابستگی‌ها `server-only` را می‌آورد ⇒ گارد خنثی و بارگذاری پویا.
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const requireCjs = createRequire(import.meta.url);
const serverOnlyId = requireCjs.resolve('server-only');
(requireCjs as any).cache[serverOnlyId] = {
  id: serverOnlyId, filename: serverOnlyId, loaded: true, exports: {}, children: [], paths: [],
};

let pass = 0, fail = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + ' — got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
}

async function main() {
  const { curriculumCoursePatch } = await import('../src/lib/migration/engine');

  console.log('── هلپر patch (خالص) ──');
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: 1, recommendedSemester: null },
      { roleType: 'CORE', isRequired: true, recommendedSemester: 3 },
    ),
    { recommendedSemester: 3 },
    'ترم خالیِ موجود با ترم فایل پر می‌شود',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: 1, recommendedSemester: 3 },
      { roleType: 'CORE', isRequired: true, recommendedSemester: null },
    ),
    {},
    'ترمِ خالیِ فایل مقدار فعلی را پاک نمی‌کند',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: 1, recommendedSemester: 3 },
      { roleType: 'CORE', isRequired: true, recommendedSemester: 3 },
    ),
    {},
    'اجرای دوبارهٔ همان فایل هیچ تغییری نمی‌دهد',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: 1, recommendedSemester: 3 },
      { roleType: 'CORE', isRequired: true, recommendedSemester: 5 },
    ),
    { recommendedSemester: 5 },
    'ترم متفاوت فایل بازنویسی می‌شود',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: 1, recommendedSemester: null },
      { roleType: null, isRequired: true, recommendedSemester: null },
    ),
    {},
    'نقش خالیِ فایل نقش فعلی را بازنویسی نمی‌کند',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: 1, recommendedSemester: null },
      { roleType: 'ELECTIVE', isRequired: false, recommendedSemester: null },
    ),
    { roleType: 'ELECTIVE', isElective: 1, isRequired: 0, isGraduationRequired: 0 },
    'نقش اختیاری: نقش + isElective + الزامی هم‌گام می‌شوند',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'MAJOR', isRequired: 1, recommendedSemester: 2 },
      { roleType: 'MAJOR', isRequired: false, recommendedSemester: 2 },
    ),
    { isRequired: 0, isGraduationRequired: 0 },
    'الزامی خیر: هر دو ستون صفر می‌شوند',
  );
  eq(
    curriculumCoursePatch(
      { roleType: 'CORE', isRequired: '1', recommendedSemester: '3' },
      { roleType: 'CORE', isRequired: true, recommendedSemester: 3 },
    ),
    {},
    'مقادیر رشته‌ای DB با اعداد فایل هم‌ارز دیده می‌شوند (idempotent)',
  );

  console.log('── سناریوی واقعی روی PGlite: بدون ترم → با ترم → دوباره ──');
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE curriculum_courses (
      id serial primary key,
      curriculum_version_id int not null,
      course_id int not null,
      role_type varchar(20),
      units varchar(10),
      is_required smallint default 1,
      is_elective smallint default 0,
      is_graduation_required smallint default 0,
      recommended_semester int,
      UNIQUE (curriculum_version_id, course_id)
    );
  `);

  const COL: Record<string, string> = {
    roleType: 'role_type', isRequired: 'is_required', isElective: 'is_elective',
    isGraduationRequired: 'is_graduation_required', recommendedSemester: 'recommended_semester',
  };
  const applyRows = async (rows: { courseId: number; role: string; req: boolean; sem: number | null }[]) => {
    let inserted = 0, updated = 0, existing = 0;
    for (const r of rows) {
      const ex = await db.query<{ id: number; roleType: string; isRequired: number; recommendedSemester: number | null }>(
        `SELECT id, role_type AS "roleType", is_required AS "isRequired", recommended_semester AS "recommendedSemester"
         FROM curriculum_courses
         WHERE curriculum_version_id = 1 AND course_id = $1`, [r.courseId]);
      const row = ex.rows[0];
      if (row) {
        const patch = curriculumCoursePatch(row as never, { roleType: r.role, isRequired: r.req, recommendedSemester: r.sem });
        const keys = Object.keys(patch);
        if (!keys.length) { existing++; continue; }
        const sets = keys.map((k, i) => `${COL[k]} = $${i + 1}`);
        await db.query(`UPDATE curriculum_courses SET ${sets.join(', ')} WHERE id = $${keys.length + 1}`,
          [...keys.map(k => patch[k]), row.id]);
        updated++;
      } else {
        const ins = await db.query(
          `INSERT INTO curriculum_courses (curriculum_version_id, course_id, role_type, is_required, is_elective, is_graduation_required, recommended_semester)
           VALUES (1, $1, $2, $3, $4, $5, $6) ON CONFLICT (curriculum_version_id, course_id) DO NOTHING`,
          [r.courseId, r.role, r.req ? 1 : 0, r.role === 'ELECTIVE' ? 1 : 0, r.req ? 1 : 0, r.sem]);
        if (ins.affectedRows) inserted++; else existing++;
      }
    }
    return { inserted, updated, existing };
  };

  const base = [
    { courseId: 101, role: 'CORE', req: true, sem: null as number | null },
    { courseId: 102, role: 'MAJOR', req: true, sem: null as number | null },
    { courseId: 103, role: 'ELECTIVE', req: false, sem: null as number | null },
  ];
  eq(await applyRows(base), { inserted: 3, updated: 0, existing: 0 }, 'ورود اول بدون ترم: ۳ درس درج شد');

  const withTerms = [
    { courseId: 101, role: 'CORE', req: true, sem: 1 },
    { courseId: 102, role: 'MAJOR', req: true, sem: 2 },
    { courseId: 103, role: 'ELECTIVE', req: false, sem: 4 },
  ];
  eq(await applyRows(withTerms), { inserted: 0, updated: 3, existing: 0 }, 'ورود دوم با ترم: هر ۳ ردیف موجود به‌روزرسانی شد');
  const chk = await db.query<{ recommended_semester: number }>(
    `SELECT recommended_semester FROM curriculum_courses ORDER BY course_id`);
  eq(chk.rows.map(r => r.recommended_semester), [1, 2, 4], 'ترم‌ها روی همان نسخه نشست (بازنویسی شد)');

  eq(await applyRows(withTerms), { inserted: 0, updated: 0, existing: 3 }, 'اجرای سوم: هیچ تغییری (idempotent)');

  eq(await applyRows(base), { inserted: 0, updated: 0, existing: 3 }, 'فایل بدون ترم، ترم‌های موجود را پاک نمی‌کند');
  const chk2 = await db.query<{ recommended_semester: number }>(`SELECT recommended_semester FROM curriculum_courses ORDER BY course_id`);
  eq(chk2.rows.map(r => r.recommended_semester), [1, 2, 4], 'ترم‌ها دست‌نخورده ماندند');

  eq((await applyRows([{ courseId: 102, role: 'ELECTIVE', req: false, sem: 2 }])).updated, 1, 'تغییر نقش ردیف موجود اعمال شد');
  const chk3 = await db.query<{ role_type: string; is_elective: number; is_required: number; is_graduation_required: number }>(
    `SELECT role_type, is_elective, is_required, is_graduation_required FROM curriculum_courses WHERE course_id = 102`);
  eq(chk3.rows[0], { role_type: 'ELECTIVE', is_elective: 1, is_required: 0, is_graduation_required: 0 }, 'نقش/الزامی/فارغ‌التحصیلی هم‌گام شدند');

  console.log(`\n${pass} قبول / ${fail} رد`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

// ══════════════════════════════════════════════════════════════════
//  دادهٔ پایهٔ مرجع (Reference Data) — idempotent
//  چرا؟ Docker استقرار فقط جدول‌ها را می‌سازد (drizzle-kit push) و هیچ
//  داده‌ای seed نمی‌کند. در نتیجه در نصب تازه:
//   • degree_level_configs و educational_regulations خالی‌اند
//   • حساب‌های دمو (auth.ts) کاربر ساخته می‌شود ولی ردیف students
//     ساخته نمی‌شود (شرط degree && regulation برقرار نیست)
//   → پورتال دانشجوی نمونه: «پروندهٔ دانشجویی یافت نشد.»
//  این ماژول همان سه‌گانهٔ «مقطع + آیین‌نامه + دانشکده/گروه/رشته» را
//  دقیقاً مطابق seed فاز صفر می‌سازد (ON CONFLICT → بی‌خطر برای اجرای
//  مجدد روی دیتابیس پر).
// ══════════════════════════════════════════════════════════════════
import { eq } from 'drizzle-orm';
import { db, ensureDbSchemaPatches } from '@/db';
import {
  degree_level_configs,
  departments,
  educational_regulations,
  faculties,
  majors,
  roles,
} from '@/db/schema';

/** نقش‌های سیستم — همان نقش‌هایی که auth.ts / داشبوردها استفاده می‌کنند */
const BASE_ROLES = [
  { code: 'STUDENT', title: 'دانشجو' },
  { code: 'PROFESSOR', title: 'استاد' },
  { code: 'DEP_HEAD', title: 'مدیر گروه' },
  { code: 'EDU_EXPERT', title: 'کارشناس آموزش' },
  { code: 'VICE_EDU', title: 'معاون آموزشی' },
  { code: 'FINANCE_EXPERT', title: 'کارشناس مالی' },
  { code: 'ADMIN', title: 'مدیر سامانه' },
  { code: 'ARCHIVE_EXPERT', title: 'کارشناس بایگانی' },
  { code: 'MILITARY_OFFICER', title: 'کارشناس نظام وظیفه' },
  { code: 'PROCTOR', title: 'مراقب امتحان' },
  { code: 'VAULT_MANAGER', title: 'مسئول مخزن مدارک' },
];

/** مقاطع — عین seed فاز صفر + کاردانی و دکتری حرفه‌ای */
const BASE_DEGREES = [
  { title: 'کارشناسی پیوسته', code: 'BS', defaultPassingGrade: '10.00', conditionalGpaThreshold: '12.00', maxUnitsPerTerm: 20 },
  { title: 'کارشناسی ارشد', code: 'MS', defaultPassingGrade: '12.00', conditionalGpaThreshold: '14.00', maxUnitsPerTerm: 12 },
  { title: 'کاردانی پیوسته', code: 'AD', defaultPassingGrade: '10.00', conditionalGpaThreshold: '12.00', maxUnitsPerTerm: 18 },
  { title: 'دکتری حرفه‌ای', code: 'PHD', defaultPassingGrade: '14.00', conditionalGpaThreshold: '16.00', maxUnitsPerTerm: 12 },
];

/** آیین‌نامهٔ مصوب ۱۴۰۳ — عین seed فاز صفر */
const REGULATION_1403 = {
  regular_term_rules: { minUnits: 12, maxUnits: 20, probationMaxUnits: 14, gpaA_MaxUnits: 24 },
  summer_term_rules: { defaultMaxUnits: 6, graduatingMaxUnits: 8 },
  graduating_term_rules: { canTakeWithProbation: true, maxUnits: 24 },
  quota_overrides: { SHAHED_ISARGAR: { summer_term_rules: { defaultMaxUnits: 8 }, probationMaxUnits: 14 } },
  failed_course_gpa_policy: 'EXCLUDE_IF_PASSED',
  unexcused_absence_policy: 'ZERO',
  probation_gpa_threshold: 12,
  max_allowed_probations: 3,
  max_study_semesters: 8,
  gpaA_threshold: 17,
};

/** دانشکده/گروه/رشته — کد رشته‌ها هماهنگ با DEFAULT_SANJESH_MAPPINGS (admissions-engine) */
const BASE_STRUCTURE: { faculty: string; facultyCode: string; department: string; departmentCode: string; majors: { name: string; code: string; degreeCode: string }[] }[] = [
  {
    faculty: 'دانشکده فنی و مهندسی', facultyCode: '20', department: 'گروه مهندسی کامپیوتر', departmentCode: '1',
    majors: [
      { name: 'مهندسی نرم‌افزار', code: '412', degreeCode: 'BS' },
      { name: 'مهندسی نرم‌افزار — انتقالی (تکمیل دوره)', code: '413', degreeCode: 'BS' },
      { name: 'مهندسی کامپیوتر — هوش مصنوعی', code: '414', degreeCode: 'BS' },
      { name: 'مهندسی کامپیوتر — ارشد', code: '113', degreeCode: 'MS' },
    ],
  },
  {
    faculty: 'دانشکده فنی و مهندسی', facultyCode: '20', department: 'گروه مهندسی برق', departmentCode: '2',
    majors: [
      { name: 'مهندسی برق — مخابرات', code: '310', degreeCode: 'BS' },
    ],
  },
  {
    faculty: 'دانشکده فنی و مهندسی', facultyCode: '20', department: 'گروه علوم کامپیوتر', departmentCode: '3',
    majors: [
      { name: 'علوم کامپیوتر', code: '201', degreeCode: 'BS' },
    ],
  },
  {
    faculty: 'دانشکده اقتصاد و علوم انسانی', facultyCode: '30', department: 'گروه مدیریت', departmentCode: '4',
    majors: [
      { name: 'مدیریت کسب و کار (MBA)', code: '601', degreeCode: 'MS' },
    ],
  },
];

/**
 * ساخت دادهٔ پایه در صورت نبود — ایمن برای اجرای مکرر (idempotent).
 * از auth.ts (قبل از ساخت دانشجوی دمو) و از scripts/seed-base.mjs صدا زده می‌شود.
 */
export async function ensureBaseReferenceData(): Promise<void> {
  // ── تضمین وجود ستون‌های جدید روی دیتابیس‌های قدیمی (بدون نیاز به db:push) ──
  await ensureDbSchemaPatches();

  // ── نقش‌ها ──
  for (const r of BASE_ROLES) {
    await db.insert(roles).values({ ...r, isSystem: 1 }).onConflictDoNothing({ target: roles.code });
  }

  // ── مقاطع ──
  const degreeIds: Record<string, number> = {};
  for (const d of BASE_DEGREES) {
    const [row] = await db
      .insert(degree_level_configs)
      .values(d)
      .onConflictDoNothing({ target: degree_level_configs.code })
      .returning({ id: degree_level_configs.id });
    if (row) {
      degreeIds[d.code] = row.id;
    } else {
      const [existing] = await db
        .select({ id: degree_level_configs.id })
        .from(degree_level_configs)
        .where(eq(degree_level_configs.code, d.code))
        .limit(1);
      if (existing) degreeIds[d.code] = existing.id;
    }
  }

  // ── آیین‌نامه (یک ردیف برای هر مقطع؛ جست‌وجو بر اساس عنوان) ──
  const regIds: Record<string, number> = {};
  for (const d of BASE_DEGREES) {
    const title = `آیین‌نامهٔ آموزشی مصوب ۱۴۰۳ — ${d.title}`;
    const [existing] = await db
      .select({ id: educational_regulations.id })
      .from(educational_regulations)
      .where(eq(educational_regulations.title, title))
      .limit(1);
    if (existing) {
      regIds[d.code] = existing.id;
    } else if (degreeIds[d.code]) {
      const [ins] = await db
        .insert(educational_regulations)
        .values({
          title,
          degreeLevelId: degreeIds[d.code],
          effectiveFromYear: 1403,
          rulesConfig: JSON.stringify(REGULATION_1403),
        })
        .returning({ id: educational_regulations.id });
      if (ins) regIds[d.code] = ins.id;
    }
  }

  // ── دانشکده / گروه / رشته ──
  for (const f of BASE_STRUCTURE) {
    let [fac] = await db
      .select({ id: faculties.id })
      .from(faculties)
      .where(eq(faculties.facultyCode, f.facultyCode))
      .limit(1);
    if (!fac) {
      [fac] = await db
        .select({ id: faculties.id })
        .from(faculties)
        .where(eq(faculties.name, f.faculty))
        .limit(1);
    }
    if (!fac) {
      const [ins] = await db
        .insert(faculties)
        .values({ name: f.faculty, facultyCode: f.facultyCode })
        .returning({ id: faculties.id });
      fac = ins;
    }
    if (!fac) continue;

    let [dep] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.departmentCode, f.departmentCode))
      .limit(1);
    if (!dep) {
      [dep] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.name, f.department))
        .limit(1);
    }
    if (!dep) {
      const [ins] = await db
        .insert(departments)
        .values({ name: f.department, facultyId: fac.id, departmentCode: f.departmentCode })
        .returning({ id: departments.id });
      dep = ins;
    }
    if (!dep) continue;

    for (const m of f.majors) {
      const degreeId = degreeIds[m.degreeCode];
      if (!degreeId) continue;
      await db
        .insert(majors)
        .values({
          name: m.name,
          degreeLevelId: degreeId,
          departmentId: dep.id,
          facultyId: fac.id,
          majorCode: m.code,
          isActive: 1,
        })
        .onConflictDoNothing({ target: majors.majorCode });
    }
  }
}

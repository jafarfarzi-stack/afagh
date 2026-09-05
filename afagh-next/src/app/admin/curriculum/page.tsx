import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { departments, faculties, majors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurriculumOverviewAction } from './actions';
import CurriculumManagerClient from './CurriculumManagerClient';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ مدیریت برنامهٔ درسی — فاز ۷ (Thin Client) + ادغام فاز ۷الف:
 * همهٔ داده‌های اولیه از سرور می‌آیند (نگاشت مستقیم به curriculum_versions /
 * curriculum_tracks / courses) و هر تغییر از طریق Server Actions (گارد نقش)
 * انجام می‌شود. Client فقط نمایش و ارکستراسیون است.
 * غنی‌سازی فاز ۷الف (نام دانشکده/گروه، واحد الزامیِ آخرین نسخهٔ غیرپیش‌نویس،
 * گرایش‌ها) در همین‌جا انجام و به‌همراه خطای صریحِ بارگذاری به Client داده می‌شود.
 */
export default async function AdminCurriculumPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);
  const overview = await getCurriculumOverviewAction();
  if (!overview.ok) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-rose-200 p-6 max-w-md text-center space-y-2">
          <div className="text-2xl">⚠️</div>
          <h2 className="font-extrabold text-slate-900">بارگذاری ماژول برنامهٔ درسی ناموفق بود</h2>
          <p className="text-xs text-slate-600 font-bold">{overview.error}</p>
        </div>
      </div>
    );
  }

  // بانک دروس به‌صورت lazy توسط Client (listCourseBankAction) بارگیری می‌شود؛
  // در این‌جا فقط خروجی غنی‌سازی‌های فاز ۷الف (دانشکده/گروه/واحد/گرایش) را می‌سازیم.
  const deptRows = await db
    .select({ majorId: majors.id, departmentName: departments.name, facultyName: faculties.name })
    .from(majors)
    .leftJoin(departments, eq(departments.id, majors.departmentId))
    .leftJoin(faculties, eq(faculties.id, departments.facultyId));

  const ov = overview.data;
  const majorItems = ov.majors.map((m) => {
    const dept = deptRows.find((d) => d.majorId === m.id);
    const trackTitles = ov.tracks.filter((t) => t.majorId === m.id).map((t) => t.title);
    const latestNonDraft = ov.versions.find((v) => v.majorId === m.id && v.status !== 'DRAFT');
    return {
      id: m.id,
      code: m.code ?? String(m.id),
      name: m.name,
      degreeLevelId: m.degreeLevelId,
      degreeTitle: m.degreeTitle ?? null,
      departmentName: dept?.departmentName ?? 'گروه آموزشی',
      facultyName: dept?.facultyName ?? 'دانشکده',
      minUnits: Number(latestNonDraft?.totalRequiredUnits ?? 0),
      tracks: trackTitles.length > 0 ? trackTitles : ['نامشخص'],
    };
  });

  return (
    <CurriculumManagerClient
      initial={{
        majors: majorItems,
        versions: ov.versions.map((v) => ({
          id: v.id,
          majorId: v.majorId,
          degreeLevelId: v.degreeLevelId,
          trackId: v.trackId,
          versionCode: v.versionCode,
          title: v.title,
          status: v.status,
          entryYearFrom: v.entryYearFrom,
          entryYearTo: v.entryYearTo,
          totalRequiredUnits: String(v.totalRequiredUnits),
          courseCount: v.courseCount,
        })),
        tracks: ov.tracks.map((t) => ({ id: t.id, code: null, title: t.title })),
      }}
    />
  );
}

import { db } from '@/db';
import { courses, departments, faculties, majors } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import CurriculumManagerClient, { type CurriculumInitialData } from './CurriculumManagerClient';
import { getCurriculumOverviewAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ مدیریت برنامهٔ درسی — فاز ۷ (Thin Client).
 * همهٔ داده‌های اولیه از سرور می‌آیند (نگاشت مستقیم به curriculum_versions / curriculum_tracks / courses)
 * و هر تغییر از طریق Server Actions (گارد نقش) انجام می‌شود. Client فقط نمایش و ارکستراسیون است.
 */
export default async function AdminCurriculumPage() {
  const overview = await getCurriculumOverviewAction(); // شامل requireRole(['ADMIN','EDU_EXPERT'])

  const [deptRows, bankRows] = await Promise.all([
    db
      .select({ majorId: majors.id, departmentName: departments.name, facultyName: faculties.name })
      .from(majors)
      .leftJoin(departments, eq(departments.id, majors.departmentId))
      .leftJoin(faculties, eq(faculties.id, departments.facultyId)),
    db.select().from(courses).orderBy(asc(courses.code)),
  ]);

  const ov = overview.ok && overview.data ? overview.data : null;
  const versions = ov ? ov.versions : [];

  const majorItems: CurriculumInitialData['majors'] = (ov ? ov.majors : []).map((m) => {
    const dept = deptRows.find((d) => d.majorId === m.id);
    const trackTitles = ov
      ? ov.tracks.filter((t) => t.majorId === m.id).map((t) => t.title)
      : [];
    const latestNonDraft = versions.find((v) => v.majorId === m.id && v.status !== 'DRAFT');
    return {
      id: m.id,
      code: m.code || String(m.id),
      name: m.name,
      degreeLevel: m.degreeTitle || 'کارشناسی پیوسته',
      degreeLevelId: m.degreeLevelId,
      departmentName: dept?.departmentName || 'گروه آموزشی',
      facultyName: dept?.facultyName || 'دانشکده',
      minUnits: Number(latestNonDraft?.totalRequiredUnits ?? 0),
      tracks: trackTitles.length > 0 ? trackTitles : ['نامشخص'],
    };
  });

  const initial: CurriculumInitialData = {
    majors: majorItems,
    versions: versions.map((v) => ({
      id: v.id,
      majorId: v.majorId,
      degreeLevelId: v.degreeLevelId,
      trackId: v.trackId,
      versionCode: v.versionCode,
      title: v.title,
      status: v.status,
      entryYearFrom: v.entryYearFrom,
      entryYearTo: v.entryYearTo,
      totalRequiredUnits: v.totalRequiredUnits != null ? Number(v.totalRequiredUnits) : null,
      courseCount: v.courseCount,
    })),
    tracks: ov
      ? ov.tracks.map((t) => ({ id: t.id, majorId: t.majorId, title: t.title }))
      : [],
    courseBank: bankRows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      courseType: c.courseType || 'نامشخص',
      units: Number(c.units),
      theoreticalUnits: Number(c.theoreticalUnits ?? 0),
      practicalUnits: Number(c.practicalUnits ?? 0),
      prerequisites: '',
      corequisites: '',
    })),
  };

  return <CurriculumManagerClient initial={initial} />;
}

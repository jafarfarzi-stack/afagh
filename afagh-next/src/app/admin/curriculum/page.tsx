import { db } from '@/db';
import { degree_level_configs, departments, faculties, majors } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import CurriculumManagerClient, { MajorItem } from './CurriculumManagerClient';

export const dynamic = 'force-dynamic';

export default async function AdminCurriculumPage() {
  await requireRole(['ADMIN', 'EDU_EXPERT']);

  // Fetch majors with faculty, department, and degree levels from database
  let dbMajorsList: MajorItem[] = [];
  try {
    const rawMajors = await db
      .select({
        id: majors.id,
        code: majors.majorCode,
        name: majors.name,
        degreeLevelId: majors.degreeLevelId,
        degreeTitle: degree_level_configs.title,
        departmentName: departments.name,
        facultyName: faculties.name,
      })
      .from(majors)
      .leftJoin(degree_level_configs, eq(degree_level_configs.id, majors.degreeLevelId))
      .leftJoin(departments, eq(departments.id, majors.departmentId))
      .leftJoin(faculties, eq(faculties.id, departments.facultyId));

    if (rawMajors && rawMajors.length > 0) {
      dbMajorsList = rawMajors.map(m => ({
        id: m.id,
        code: m.code || String(m.id),
        name: m.name,
        degreeLevel: m.degreeTitle || 'کارشناسی پیوسته',
        degreeLevelId: m.degreeLevelId,
        departmentName: m.departmentName || 'گروه آموزشی',
        facultyName: m.facultyName || 'دانشکده',
        minUnits: m.degreeTitle?.includes('ارشد') ? 32 : 140,
        tracks: ['نامشخص'],
      }));
    }
  } catch (err) {
    console.error('Failed to query majors from db:', err);
  }

  return <CurriculumManagerClient initialMajors={dbMajorsList} />;
}

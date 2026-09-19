import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import {
  curriculum_courses, curriculum_versions, majors,
  courses, degree_level_configs
} from '@/db/schema';
import { eq, ilike, or, asc, sql, count, and, isNull } from 'drizzle-orm';

const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get('q') || '';
  const majorId = Number(req.nextUrl.searchParams.get('majorId') || '0');
  const degreeLevelId = Number(req.nextUrl.searchParams.get('degreeLevelId') || '0');
  const versionId = Number(req.nextUrl.searchParams.get('versionId') || '0');

  const conditions = [];
  if (majorId) conditions.push(eq(curriculum_versions.majorId, majorId));
  if (degreeLevelId) conditions.push(eq(curriculum_versions.degreeLevelId, degreeLevelId));
  if (versionId) conditions.push(eq(curriculum_courses.curriculumVersionId, versionId));
  if (q) {
    conditions.push(or(
      ilike(courses.code, `%${q}%`),
      ilike(courses.title, `%${q}%`),
      ilike(majors.name, `%${q}%`),
    ));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: curriculum_courses.id,
      courseId: curriculum_courses.courseId,
      courseCode: courses.code,
      courseTitle: courses.title,
      units: curriculum_courses.units,
      roleType: curriculum_courses.roleType,
      recommendedSemester: curriculum_courses.recommendedSemester,
      minGrade: curriculum_courses.minGrade,
      passGradeStatusCode: curriculum_courses.passGradeStatusCode,
      failGradeStatusCode: curriculum_courses.failGradeStatusCode,
      isRequired: curriculum_courses.isRequired,
      isElective: curriculum_courses.isElective,
      versionId: curriculum_versions.id,
      versionCode: curriculum_versions.versionCode,
      versionTitle: curriculum_versions.title,
      status: curriculum_versions.status,
      majorId: majors.id,
      majorName: majors.name,
      degreeLevelId: degree_level_configs.id,
      degreeLevelTitle: degree_level_configs.title,
      entryYearFrom: curriculum_versions.entryYearFrom,
      entryYearTo: curriculum_versions.entryYearTo,
    })
    .from(curriculum_courses)
    .innerJoin(curriculum_versions, eq(curriculum_courses.curriculumVersionId, curriculum_versions.id))
    .innerJoin(courses, eq(curriculum_courses.courseId, courses.id))
    .innerJoin(majors, eq(curriculum_versions.majorId, majors.id))
    .leftJoin(degree_level_configs, eq(curriculum_versions.degreeLevelId, degree_level_configs.id))
    .where(where)
    .orderBy(
      asc(majors.name),
      asc(curriculum_versions.versionCode),
      asc(curriculum_courses.recommendedSemester),
      asc(courses.code)
    )
    .limit(500);

  return NextResponse.json({ ok: true, courses: rows });
}

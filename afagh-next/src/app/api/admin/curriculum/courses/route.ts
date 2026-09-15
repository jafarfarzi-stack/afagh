import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { curriculum_courses, courses } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('EDU_EXPERT'))) {
    return NextResponse.json({ courses: [] }, { status: 403 });
  }
  const versionId = Number(req.nextUrl.searchParams.get('versionId'));
  if (!versionId) return NextResponse.json({ courses: [] });
  const rows = await db
    .select({
      courseId: curriculum_courses.courseId,
      code: courses.code,
      title: courses.title,
      units: courses.units,
      passGradeStatusCode: curriculum_courses.passGradeStatusCode,
      failGradeStatusCode: curriculum_courses.failGradeStatusCode,
      roleType: curriculum_courses.roleType,
      recommendedSemester: curriculum_courses.recommendedSemester,
    })
    .from(curriculum_courses)
    .innerJoin(courses, eq(courses.id, curriculum_courses.courseId))
    .where(eq(curriculum_courses.curriculumVersionId, versionId))
    .orderBy(asc(courses.code));
  return NextResponse.json({ courses: rows });
}

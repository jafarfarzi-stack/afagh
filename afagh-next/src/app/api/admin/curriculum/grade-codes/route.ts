import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { curriculum_courses, curriculum_versions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes('ADMIN') && !user.roles.includes('EDU_EXPERT'))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const versionId = Number(req.nextUrl.searchParams.get('versionId'));
  const courseId = Number(req.nextUrl.searchParams.get('courseId'));
  if (!versionId || !courseId) {
    return NextResponse.json({ ok: false, error: 'شناسه نسخه یا درس نامعتبر است.' }, { status: 400 });
  }
  const body = await req.json();
  const { passGradeStatusCode, failGradeStatusCode } = body;

  // نگهبان دانشگاه: نسخهٔ دانشگاه دیگر قابل ویرایش نیست (NULL = سراسری، مجاز).
  const uni = await getCurrentUniversity().catch(() => null);
  if (uni) {
    const [ver] = await db.select({ universityId: curriculum_versions.universityId }).from(curriculum_versions).where(eq(curriculum_versions.id, versionId)).limit(1);
    if (!ver) return NextResponse.json({ ok: false, error: 'نسخه یافت نشد.' }, { status: 404 });
    if (ver.universityId != null && ver.universityId !== uni.id) {
      return NextResponse.json({ ok: false, error: 'این نسخه متعلق به دانشگاه دیگری است.' }, { status: 403 });
    }
  }

  await db
    .update(curriculum_courses)
    .set({
      passGradeStatusCode: passGradeStatusCode ?? null,
      failGradeStatusCode: failGradeStatusCode ?? null,
    })
    .where(and(
      eq(curriculum_courses.curriculumVersionId, versionId),
      eq(curriculum_courses.courseId, courseId),
    ));

  return NextResponse.json({ ok: true });
}

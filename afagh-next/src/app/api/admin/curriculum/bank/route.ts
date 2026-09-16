import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { courses, departments, degree_level_configs, equivalence_clusters } from '@/db/schema';
import { eq, ilike, or, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const ALLOWED = ['ADMIN', 'EDU_EXPERT', 'VICE_EDU'];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get('q') || '';
  const where = q
    ? or(ilike(courses.code, `%${q}%`), ilike(courses.title, `%${q}%`))
    : undefined;
  const rows = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      theoreticalUnits: courses.theoreticalUnits,
      practicalUnits: courses.practicalUnits,
      units: courses.units,
      courseType: courses.courseType,
      gradingType: courses.gradingType,
      affectsGpa: courses.affectsGpa,
      departmentId: courses.departmentId,
      departmentName: departments.name,
      degreeLevelId: courses.degreeLevelId,
      degreeLevelTitle: degree_level_configs.title,
      clusterId: courses.clusterId,
      clusterTitle: equivalence_clusters.clusterTitle,
      offeringScope: courses.offeringScope,
      locationType: courses.locationType,
      courseNature: courses.courseNature,
      englishName: courses.englishName,
      description: courses.description,
      weeklyTheoryHours: courses.weeklyTheoryHours,
      weeklyPracticalHours: courses.weeklyPracticalHours,
      isThesis: courses.isThesis,
      hasProject: courses.hasProject,
      internshipUnits: courses.internshipUnits,
      minPassedMark: courses.minPassedMark,
      defaultAcceptMarkState: courses.defaultAcceptMarkState,
      defaultRejectMarkState: courses.defaultRejectMarkState,
    })
    .from(courses)
    .leftJoin(departments, eq(courses.departmentId, departments.id))
    .leftJoin(degree_level_configs, eq(courses.degreeLevelId, degree_level_configs.id))
    .leftJoin(equivalence_clusters, eq(courses.clusterId, equivalence_clusters.id))
    .where(where)
    .orderBy(asc(courses.code));
  return NextResponse.json({ ok: true, courses: rows });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ ok: false, error: 'شناسه درس نامعتبر.' }, { status: 400 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (body.title != null) patch.title = body.title;
  if (body.theoreticalUnits != null) patch.theoreticalUnits = String(body.theoreticalUnits);
  if (body.practicalUnits != null) patch.practicalUnits = String(body.practicalUnits);
  if (body.courseType != null) patch.courseType = body.courseType;
  if (body.gradingType != null) patch.gradingType = body.gradingType;
  if (body.affectsGpa != null) patch.affectsGpa = body.affectsGpa ? 1 : 0;
  if (body.departmentId !== undefined) patch.departmentId = body.departmentId || null;
  if (body.degreeLevelId !== undefined) patch.degreeLevelId = body.degreeLevelId || null;
  if (body.clusterId !== undefined) patch.clusterId = body.clusterId || null;
  if (body.offeringScope != null) patch.offeringScope = body.offeringScope;
  if (body.locationType != null) patch.locationType = body.locationType;
  // فیلدهای جدید سما
  if (body.courseNature != null) patch.courseNature = body.courseNature || null;
  if (body.englishName != null) patch.englishName = body.englishName || null;
  if (body.description != null) patch.description = body.description || null;
  if (body.weeklyTheoryHours != null) patch.weeklyTheoryHours = String(body.weeklyTheoryHours);
  if (body.weeklyPracticalHours != null) patch.weeklyPracticalHours = String(body.weeklyPracticalHours);
  if (body.isThesis != null) patch.isThesis = body.isThesis ? 1 : 0;
  if (body.hasProject != null) patch.hasProject = body.hasProject ? 1 : 0;
  if (body.internshipUnits != null) patch.internshipUnits = String(body.internshipUnits);
  if (body.minPassedMark != null) patch.minPassedMark = String(body.minPassedMark);
  if (body.defaultAcceptMarkState != null) patch.defaultAcceptMarkState = body.defaultAcceptMarkState || null;
  if (body.defaultRejectMarkState != null) patch.defaultRejectMarkState = body.defaultRejectMarkState || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'فیلدی برای ویرایش ارسال نشد.' }, { status: 400 });
  }

  // محاسبه واحد کل
  if (patch.theoreticalUnits != null || patch.practicalUnits != null) {
    const [current] = await db.select({ theoreticalUnits: courses.theoreticalUnits, practicalUnits: courses.practicalUnits }).from(courses).where(eq(courses.id, id)).limit(1);
    if (current) {
      const theo = Number(patch.theoreticalUnits ?? current.theoreticalUnits ?? 0);
      const prac = Number(patch.practicalUnits ?? current.practicalUnits ?? 0);
      patch.units = String(theo + prac);
    }
  }

  await db.update(courses).set(patch).where(eq(courses.id, id));
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => ALLOWED.includes(r))) {
    return NextResponse.json({ ok: false, error: 'دسترسی غیرمجاز.' }, { status: 403 });
  }
  const body = await req.json();
  const code = String(body.code || '').trim();
  const title = String(body.title || '').trim();
  const theo = Number(body.theoreticalUnits || 0);
  const prac = Number(body.practicalUnits || 0);
  if (!code || !title) {
    return NextResponse.json({ ok: false, error: 'کد درس و عنوان الزامی است.' }, { status: 400 });
  }
  if (theo + prac <= 0) {
    return NextResponse.json({ ok: false, error: 'مجموع واحد نظری و عملی باید بیشتر از صفر باشد.' }, { status: 400 });
  }
  const [dup] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, code)).limit(1);
  if (dup) {
    return NextResponse.json({ ok: false, error: `کد درس تکراری است: ${code}` }, { status: 409 });
  }
  const departmentId = Number(body.departmentId || 0) || null;
  const degreeLevelId = Number(body.degreeLevelId || 0) || null;
  const clusterId = Number(body.clusterId || 0) || null;
  const [row] = await db.insert(courses).values({
    code,
    title,
    theoreticalUnits: String(theo),
    practicalUnits: String(prac),
    units: String(theo + prac),
    courseType: String(body.courseType || 'تخصصی'),
    gradingType: body.gradingType === 'PASS_FAIL' ? 'PASS_FAIL' : 'NUMERIC',
    affectsGpa: body.affectsGpa ? 1 : 1,
    departmentId,
    degreeLevelId,
    clusterId,
    offeringScope: String(body.offeringScope || 'DEPARTMENTAL'),
    locationType: String(body.locationType || 'IN_CAMPUS'),
    // فیلدهای جدید سما
    courseNature: body.courseNature || null,
    englishName: body.englishName || null,
    description: body.description || null,
    weeklyTheoryHours: body.weeklyTheoryHours ? String(body.weeklyTheoryHours) : null,
    weeklyPracticalHours: body.weeklyPracticalHours ? String(body.weeklyPracticalHours) : null,
    isThesis: body.isThesis ? 1 : 0,
    hasProject: body.hasProject ? 1 : 0,
    internshipUnits: body.internshipUnits ? String(body.internshipUnits) : '0',
    minPassedMark: body.minPassedMark ? String(body.minPassedMark) : null,
    defaultAcceptMarkState: body.defaultAcceptMarkState || null,
    defaultRejectMarkState: body.defaultRejectMarkState || null,
  }).returning({ id: courses.id });
  revalidatePath('/admin/grade-status-codes');
  return NextResponse.json({ ok: true, data: { id: row.id } });
}

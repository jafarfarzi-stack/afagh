import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db';
import { courses, departments } from '@/db/schema';
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
    })
    .from(courses)
    .leftJoin(departments, eq(courses.departmentId, departments.id))
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
  if (body.theoreticalUnits != null) patch.theoreticalUnits = String(body.theoreticalUnits);
  if (body.practicalUnits != null) patch.practicalUnits = String(body.practicalUnits);
  if (body.courseType != null) patch.courseType = body.courseType;
  if (body.gradingType != null) patch.gradingType = body.gradingType;
  if (body.affectsGpa != null) patch.affectsGpa = body.affectsGpa ? 1 : 0;
  if (body.departmentId !== undefined) patch.departmentId = body.departmentId || null;
  if (body.title != null) patch.title = body.title;

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
  if (departmentId) {
    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId)).limit(1);
    if (!dept) return NextResponse.json({ ok: false, error: 'گروه آموزشی یافت نشد.' }, { status: 400 });
  }
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
  }).returning({ id: courses.id });
  revalidatePath('/admin/grade-status-codes');
  return NextResponse.json({ ok: true, data: { id: row.id } });
}

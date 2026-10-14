import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertCsrf } from '@/lib/security';
import { db } from '@/db';
import { payroll_calculation_rules } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';
import { calculationRuleBaseSchema } from '../route';
import { validateFormula } from '@/lib/payroll-formula';

async function ownedRuleId(id: number) {
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return { uni: null as null, ok: false as const };
  const [row] = await db.select({ universityId: payroll_calculation_rules.universityId })
    .from(payroll_calculation_rules).where(eq(payroll_calculation_rules.id, id)).limit(1);
  if (!row) return { uni, ok: false as const };
  if (row.universityId !== null && row.universityId !== uni.id) return { uni, ok: false as const };
  return { uni, ok: true as const };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    const user = await requireRole(['ADMIN']);
    const { id } = await params;
    const rid = parseInt(id);
    const own = await ownedRuleId(rid);
    if (!own.uni || !own.ok) {
      return NextResponse.json({ ok: false, error: 'رکورد یافت نشد یا متعلق به دانشگاه دیگری است.' }, { status: 403 });
    }
    const rawBody = await req.json();
    // partial روی شکل پایه اعمال می‌شود، سپس superRefine (اعتبارسنجی عبارت ریاضی) اجرا می‌گردد.
    const result = calculationRuleBaseSchema.partial().superRefine((v, ctx) => {
      if (v.minStudents != null && v.maxStudents != null && v.minStudents > v.maxStudents) {
        ctx.addIssue({ code: 'custom' as const, path: ['maxStudents'], message: 'حداکثر تعداد دانشجو باید ≥ حداقل باشد.' });
      }
      if (v.expression) {
        const bad = validateFormula(v.expression);
        if (bad) ctx.addIssue({ code: 'custom' as const, path: ['expression'], message: bad });
      }
    }).safeParse(rawBody);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.', details: result.error.flatten() }, { status: 400 });
    }
    const {
      offeringType, professorRole, academicRank, expression,
      departmentId, courseType, repeatNumber, flatBase, title, isActive,
      classMode, minStudents, maxStudents, perStudentHours,
    } = result.data;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (offeringType !== undefined) patch.offeringType = offeringType ?? null;
    if (professorRole !== undefined) patch.professorRole = professorRole ?? null;
    if (academicRank !== undefined) patch.academicRank = academicRank ?? null;
    if (expression !== undefined) patch.expression = expression ?? null;
    if (departmentId !== undefined) patch.departmentId = departmentId ?? null;
    if (courseType !== undefined) patch.courseType = courseType ?? null;
    if (repeatNumber !== undefined) patch.repeatNumber = repeatNumber ?? null;
    if (flatBase !== undefined) patch.flatBase = flatBase?.toString() ?? null;
    if (classMode !== undefined) patch.classMode = classMode ?? 'ANY';
    if (minStudents !== undefined) patch.minStudents = minStudents ?? null;
    if (maxStudents !== undefined) patch.maxStudents = maxStudents ?? null;
    if (perStudentHours !== undefined) patch.perStudentHours = perStudentHours?.toString() ?? null;
    if (title !== undefined) patch.title = title;
    if (isActive !== undefined) patch.isActive = isActive;

    await db
      .update(payroll_calculation_rules)
      .set(patch)
      .where(and(
        eq(payroll_calculation_rules.id, parseInt(id)),
        or(eq(payroll_calculation_rules.universityId, own.uni.id), isNull(payroll_calculation_rules.universityId)),
      ));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    const user = await requireRole(['ADMIN']);
    const { id } = await params;
    const rid = parseInt(id);
    const own = await ownedRuleId(rid);
    if (!own.uni || !own.ok) {
      return NextResponse.json({ ok: false, error: 'رکورد یافت نشد یا متعلق به دانشگاه دیگری است.' }, { status: 403 });
    }

    await db
      .delete(payroll_calculation_rules)
      .where(and(
        eq(payroll_calculation_rules.id, rid),
        or(eq(payroll_calculation_rules.universityId, own.uni.id), isNull(payroll_calculation_rules.universityId)),
      ));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
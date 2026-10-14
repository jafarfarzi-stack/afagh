import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertCsrf } from '@/lib/security';
import { db } from '@/db';
import { z } from 'zod';
import { payroll_calculation_rules } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';
import { validateFormula } from '@/lib/payroll-formula';

/** شکل پایه (بدون اعتبارسنجی متقابل) — تا بتوان روی آن `.partial()` زد. */
export const calculationRuleBaseSchema = z.object({
  offeringType: z.string().trim().max(50).nullable().optional(),
  // نقش آزاد است (از کاتالوگ teaching_role_defs می‌آید، نه enum ثابت)
  professorRole: z.string().trim().max(50).nullable().optional(),
  academicRank: z.string().trim().max(50).nullable().optional(),
  expression: z.string().trim().max(500).nullable().optional(),
  departmentId: z.coerce.number().int().positive().nullable().optional(),
  courseType: z.string().trim().max(50).nullable().optional(),
  repeatNumber: z.coerce.number().int().min(1).max(20).nullable().optional(),
  flatBase: z.coerce.number().min(0).max(999999999999).nullable().optional(),
  classMode: z.enum(['ANY', 'WITH_CLASS', 'NO_CLASS']).nullable().optional(),
  minStudents: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  maxStudents: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  perStudentHours: z.coerce.number().min(0).max(999).nullable().optional(),
  title: z.string().trim().min(1).max(150),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
});

/** اعتبارسنجی متقابل + صحت عبارت ریاضی (روی همان شکل پایه). */
export const calculationRuleSchema = calculationRuleBaseSchema.superRefine((v, ctx) => {
  if (v.minStudents != null && v.maxStudents != null && v.minStudents > v.maxStudents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxStudents'], message: 'حداکثر تعداد دانشجو باید ≥ حداقل باشد.' });
  }
  if (v.expression) {
    const bad = validateFormula(v.expression);
    if (bad) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expression'], message: bad });
  }
});

export async function GET() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const uni = await getCurrentUniversity().catch(() => null);
    const rows = await db
      .select()
      .from(payroll_calculation_rules)
      .where(and(
        eq(payroll_calculation_rules.isActive, 1),
        uni ? or(eq(payroll_calculation_rules.universityId, uni.id), isNull(payroll_calculation_rules.universityId)) : undefined,
      ));
    return NextResponse.json({ ok: true, rules: rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  try {
    const user = await requireRole(['ADMIN']);
    const rawBody = await req.json();
    const result = calculationRuleSchema.safeParse(rawBody);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });
    }
    const {
      offeringType, professorRole, academicRank, expression, departmentId,
      courseType, repeatNumber, flatBase, classMode,
      minStudents, maxStudents, perStudentHours, title,
    } = result.data;
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return NextResponse.json({ ok: false, error: 'دانشگاه فعال نامشخص است.' }, { status: 400 });

    await db.insert(payroll_calculation_rules).values({
      universityId: uni.id,
      offeringType: offeringType || null,
      professorRole: professorRole || null,
      academicRank: academicRank || null,
      expression: expression || null,
      departmentId: departmentId ?? null,
      courseType: courseType || null,
      repeatNumber: repeatNumber ?? null,
      flatBase: flatBase?.toString() ?? null,
      classMode: classMode || 'ANY',
      minStudents: minStudents ?? null,
      maxStudents: maxStudents ?? null,
      perStudentHours: perStudentHours?.toString() ?? null,
      title,
      isActive: 1,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
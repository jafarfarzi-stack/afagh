import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { db } from '@/db';
import { z } from 'zod';
import { payroll_calculation_rules } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

export const calculationRuleSchema = z.object({
  offeringType: z.enum(['THEORY', 'THESIS', 'DIRECTED_READING', 'INTERNSHIP', 'NORMAL', 'TRANSFER']).nullable().optional(),
  professorRole: z.enum(['MAIN_LECTURER', 'SUPERVISOR', 'ADVISOR', 'REVIEWER', 'EXAMINER']).nullable().optional(),
  academicRank: z.enum(['مربی', 'استادیار', 'دانشیار', 'استاد تمام']).nullable().optional(),
  multiplierUnit: z.coerce.number().min(0).max(99.99).nullable().optional(),
  multiplierPerStudent: z.coerce.number().min(0).max(99.99).nullable().optional(),
  flatFee: z.coerce.number().int().min(0).max(999999999999).nullable().optional(),
  title: z.string().trim().min(1).max(150),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
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
  assertSameOrigin(req);
  try {
    const user = await requireRole(['ADMIN']);
    const rawBody = await req.json();
    const result = calculationRuleSchema.safeParse(rawBody);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });
    }
    const {
      offeringType,
      professorRole,
      academicRank,
      multiplierUnit,
      multiplierPerStudent,
      flatFee,
      title,
    } = result.data;
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return NextResponse.json({ ok: false, error: 'دانشگاه فعال نامشخص است.' }, { status: 400 });

    await db.insert(payroll_calculation_rules).values({
      universityId: uni.id,
      offeringType: offeringType || null,
      professorRole: professorRole || null,
      academicRank: academicRank || null,
      multiplierUnit: multiplierUnit?.toString() ?? null,
      multiplierPerStudent: multiplierPerStudent?.toString() ?? null,
      flatFee: flatFee?.toString() ?? null,
      title,
      isActive: 1,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
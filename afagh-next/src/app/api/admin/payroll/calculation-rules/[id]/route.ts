import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { db } from '@/db';
import { payroll_calculation_rules } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';
import { calculationRuleSchema } from '../route';

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
  assertSameOrigin(req);
  try {
    const user = await requireRole(['ADMIN']);
    const { id } = await params;
    const rid = parseInt(id);
    const own = await ownedRuleId(rid);
    if (!own.uni || !own.ok) {
      return NextResponse.json({ ok: false, error: 'رکورد یافت نشد یا متعلق به دانشگاه دیگری است.' }, { status: 403 });
    }
    const rawBody = await req.json();
    const result = calculationRuleSchema.partial().safeParse(rawBody);
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
      isActive,
    } = result.data;

    await db
      .update(payroll_calculation_rules)
      .set({
        offeringType: offeringType ?? null,
        professorRole: professorRole ?? null,
        academicRank: academicRank ?? null,
        multiplierUnit: multiplierUnit?.toString() ?? null,
        multiplierPerStudent: multiplierPerStudent?.toString() ?? null,
        flatFee: flatFee?.toString() ?? null,
        title,
        isActive: isActive ?? 1,
        updatedAt: new Date(),
      })
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
  assertSameOrigin(req);
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
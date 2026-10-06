import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { payroll_calculation_rules } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

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
  try {
    const user = await requireRole(['ADMIN']);
    const body = await req.json();
    const {
      offeringType,
      professorRole,
      academicRank,
      multiplierUnit,
      multiplierPerStudent,
      flatFee,
      title,
    } = body;

    if (!title) {
      return NextResponse.json({ ok: false, error: 'عنوان قانون الزامی است' }, { status: 400 });
    }
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
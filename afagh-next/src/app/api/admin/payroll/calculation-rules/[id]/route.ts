import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { payroll_calculation_rules } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN']);
    const { id } = await params;
    const body = await req.json();
    const {
      offeringType,
      professorRole,
      academicRank,
      multiplierUnit,
      multiplierPerStudent,
      flatFee,
      title,
      isActive,
    } = body;

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
      .where(eq(payroll_calculation_rules.id, parseInt(id)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['ADMIN']);
    const { id } = await params;

    await db
      .delete(payroll_calculation_rules)
      .where(eq(payroll_calculation_rules.id, parseInt(id)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
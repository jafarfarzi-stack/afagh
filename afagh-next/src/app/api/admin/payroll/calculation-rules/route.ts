import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { payroll_calculation_rules } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const rows = await db
      .select()
      .from(payroll_calculation_rules)
      .where(eq(payroll_calculation_rules.isActive, 1));
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

    await db.insert(payroll_calculation_rules).values({
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
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { teaching_coefficients } from '@/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getCurrentUniversity } from '@/lib/university-scope';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const uni = await getCurrentUniversity().catch(() => null);
    const rows = await db.select().from(teaching_coefficients)
      .where(uni ? or(eq(teaching_coefficients.universityId, uni.id), isNull(teaching_coefficients.universityId)) : undefined);
    return NextResponse.json({ ok: true, coefficients: rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(['ADMIN']);
    const body = await req.json();
    const { ruleName, multiplier } = body;

    if (!ruleName || typeof multiplier !== 'number') {
      return NextResponse.json({ ok: false, error: 'پارامترهای نامعتبر' }, { status: 400 });
    }
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return NextResponse.json({ ok: false, error: 'دانشگاه فعال نامشخص است.' }, { status: 400 });
    const uniScope = or(eq(teaching_coefficients.universityId, uni.id), isNull(teaching_coefficients.universityId));

    const existing = await db
      .select()
      .from(teaching_coefficients)
      .where(and(eq(teaching_coefficients.ruleName, ruleName), uniScope))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(teaching_coefficients)
        .set({ multiplier: String(multiplier) })
        .where(and(eq(teaching_coefficients.ruleName, ruleName), uniScope));
    } else {
      await db.insert(teaching_coefficients).values({ universityId: uni.id, ruleName, multiplier: String(multiplier) });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/db';
import { teaching_coefficients } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'EDU_EXPERT']);
    const rows = await db.select().from(teaching_coefficients);
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

    const existing = await db
      .select()
      .from(teaching_coefficients)
      .where(eq(teaching_coefficients.ruleName, ruleName))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(teaching_coefficients)
        .set({ multiplier: String(multiplier) })
        .where(eq(teaching_coefficients.ruleName, ruleName));
    } else {
      await db.insert(teaching_coefficients).values({ ruleName, multiplier: String(multiplier) });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 401 });
  }
}
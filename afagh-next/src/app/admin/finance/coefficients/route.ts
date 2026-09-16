import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tuition_coefficients, academic_terms } from '@/db/schema';
import { requireRole } from '@/lib/auth';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

export async function GET() {
  const auth = await requireRole(FINANCE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const rows = await db
    .select({
      id: tuition_coefficients.id,
      termId: tuition_coefficients.termId,
      variableCoefficient: tuition_coefficients.variableCoefficient,
      fixedCoefficient: tuition_coefficients.fixedCoefficient,
      note: tuition_coefficients.note,
      updatedAt: tuition_coefficients.updatedAt,
      termTitle: academic_terms.title,
      termCode: academic_terms.termCode,
    })
    .from(tuition_coefficients)
    .leftJoin(academic_terms, eq(academic_terms.id, tuition_coefficients.termId))
    .orderBy(tuition_coefficients.id);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(FINANCE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { termId, variableCoefficient, fixedCoefficient, note } = body;

  if (!termId) return NextResponse.json({ error: 'ترم الزامی است' }, { status: 400 });

  const vCoeff = Number(variableCoefficient);
  const fCoeff = Number(fixedCoefficient);
  if (!Number.isFinite(vCoeff) || vCoeff < 0.5 || vCoeff > 5) {
    return NextResponse.json({ error: 'ضریب متغیر باید بین ۰.۵۰ تا ۵.۰۰ باشد' }, { status: 400 });
  }
  if (!Number.isFinite(fCoeff) || fCoeff < 0.5 || fCoeff > 5) {
    return NextResponse.json({ error: 'ضریب ثابت باید بین ۰.۵۰ تا ۵.۰۰ باشد' }, { status: 400 });
  }

  // بررسی وجود ترم
  const [term] = await db.select().from(academic_terms).where(eq(academic_terms.id, termId)).limit(1);
  if (!term) return NextResponse.json({ error: 'ترم یافت نشد' }, { status: 404 });

  // upsert: اگر قبلاً ضریبی برای این ترم تعریف شده، به‌روز کن
  const [existing] = await db
    .select({ id: tuition_coefficients.id })
    .from(tuition_coefficients)
    .where(eq(tuition_coefficients.termId, termId))
    .limit(1);

  if (existing) {
    await db.update(tuition_coefficients)
      .set({
        variableCoefficient: String(vCoeff),
        fixedCoefficient: String(fCoeff),
        note: note || null,
        updatedAt: new Date(),
      })
      .where(eq(tuition_coefficients.id, existing.id));
    return NextResponse.json({ ok: true, id: existing.id });
  }

  const [ins] = await db.insert(tuition_coefficients).values({
    termId,
    variableCoefficient: String(vCoeff),
    fixedCoefficient: String(fCoeff),
    note: note || null,
  }).returning({ id: tuition_coefficients.id });

  return NextResponse.json({ ok: true, id: ins.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(FINANCE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 });

  await db.delete(tuition_coefficients).where(eq(tuition_coefficients.id, id));
  return NextResponse.json({ ok: true });
}

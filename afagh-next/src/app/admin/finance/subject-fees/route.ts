import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { subject_fee_types, student_subject_fees } from '@/db/schema';
import { requireRole } from '@/lib/auth';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

export async function GET() {
  const auth = await requireRole(FINANCE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const rows = await db.select().from(subject_fee_types).orderBy(subject_fee_types.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(FINANCE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = await req.json();
  const { id, code, title, kind, fixedAmount, variablePercent, appliesTo, isActive, note } = body;

  if (!code || !title) return NextResponse.json({ error: 'کد و عنوان الزامی است' }, { status: 400 });

  const vPercent = Number(variablePercent);
  const fAmount = Number(fixedAmount);
  if (Number.isFinite(vPercent) && (vPercent < 0 || vPercent > 100)) {
    return NextResponse.json({ error: 'درصد متغیر باید بین ۰ تا ۱۰۰ باشد' }, { status: 400 });
  }

  if (id) {
    // ویرایش
    await db.update(subject_fee_types).set({
      code, title,
      kind: kind || 'ADDITIVE',
      fixedAmount: String(fAmount || 0),
      variablePercent: String(vPercent || 0),
      appliesTo: appliesTo || 'BOTH',
      isActive: isActive ? 1 : 0,
      note: note || null,
    }).where(eq(subject_fee_types.id, id));
    return NextResponse.json({ ok: true, id });
  }

  // ایجاد
  const [ins] = await db.insert(subject_fee_types).values({
    code, title,
    kind: kind || 'ADDITIVE',
    fixedAmount: String(fAmount || 0),
    variablePercent: String(vPercent || 0),
    appliesTo: appliesTo || 'BOTH',
    isActive: isActive ? 1 : 0,
    note: note || null,
  }).returning({ id: subject_fee_types.id });

  return NextResponse.json({ ok: true, id: ins.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(FINANCE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 });

  // بررسی تخصیص به دانشجو
  const [assigned] = await db
    .select({ id: student_subject_fees.id })
    .from(student_subject_fees)
    .where(eq(student_subject_fees.subjectFeeTypeId, id))
    .limit(1);
  if (assigned) {
    return NextResponse.json({ error: 'این نوع مبلغ به دانشجویان تخصیص یافته و قابل حذف نیست' }, { status: 400 });
  }

  await db.delete(subject_fee_types).where(eq(subject_fee_types.id, id));
  return NextResponse.json({ ok: true });
}

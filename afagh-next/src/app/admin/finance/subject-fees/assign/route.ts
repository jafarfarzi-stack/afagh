import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { student_subject_fees, subject_fee_types } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

async function checkFinanceAuth() {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => FINANCE.includes(r) || r === 'ADMIN')) {
    return null;
  }
  return user;
}

export async function GET(req: NextRequest) {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const studentId = Number(searchParams.get('studentId'));
  const termId = Number(searchParams.get('termId'));
  if (!studentId) return NextResponse.json({ error: 'studentId الزامی است' }, { status: 400 });

  const conditions = [eq(student_subject_fees.studentId, studentId)];
  if (termId) conditions.push(eq(student_subject_fees.termId, termId));

  const rows = await db
    .select({
      id: student_subject_fees.id,
      studentId: student_subject_fees.studentId,
      termId: student_subject_fees.termId,
      subjectFeeTypeId: student_subject_fees.subjectFeeTypeId,
      amount: student_subject_fees.amount,
      isActive: student_subject_fees.isActive,
      note: student_subject_fees.note,
      typeCode: subject_fee_types.code,
      typeTitle: subject_fee_types.title,
      typeKind: subject_fee_types.kind,
    })
    .from(student_subject_fees)
    .innerJoin(subject_fee_types, eq(subject_fee_types.id, student_subject_fees.subjectFeeTypeId))
    .where(and(...conditions));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  const body = await req.json();
  const { studentId, termId, subjectFeeTypeId, amount, note } = body;

  if (!studentId || !termId || !subjectFeeTypeId) {
    return NextResponse.json({ error: 'دانشجو، ترم و نوع مبلغ الزامی است' }, { status: 400 });
  }

  // بررسی وجود نوع مبلغ
  const [type] = await db.select().from(subject_fee_types).where(eq(subject_fee_types.id, subjectFeeTypeId)).limit(1);
  if (!type) return NextResponse.json({ error: 'نوع مبلغ موضوعی یافت نشد' }, { status: 404 });

  // upsert
  const [existing] = await db
    .select({ id: student_subject_fees.id })
    .from(student_subject_fees)
    .where(and(
      eq(student_subject_fees.studentId, studentId),
      eq(student_subject_fees.termId, termId),
      eq(student_subject_fees.subjectFeeTypeId, subjectFeeTypeId),
    ))
    .limit(1);

  if (existing) {
    await db.update(student_subject_fees)
      .set({ amount: String(Number(amount) || 0), note: note || null, isActive: 1 })
      .where(eq(student_subject_fees.id, existing.id));
    return NextResponse.json({ ok: true, id: existing.id });
  }

  const [ins] = await db.insert(student_subject_fees).values({
    studentId,
    termId,
    subjectFeeTypeId,
    amount: String(Number(amount) || 0),
    note: note || null,
  }).returning({ id: student_subject_fees.id });

  return NextResponse.json({ ok: true, id: ins.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 });

  await db.delete(student_subject_fees).where(eq(student_subject_fees.id, id));
  return NextResponse.json({ ok: true });
}

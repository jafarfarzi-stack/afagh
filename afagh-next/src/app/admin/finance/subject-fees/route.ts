import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { subject_fee_types, student_subject_fees } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];

async function checkFinanceAuth() {
  const user = await getSessionUser();
  if (!user || !user.roles.some(r => FINANCE.includes(r) || r === 'ADMIN')) {
    return null;
  }
  return user;
}

export async function GET() {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });
  const uni = await getCurrentUniversity().catch(() => null);

  const rows = await db.select().from(subject_fee_types)
    .where(uni ? or(eq(subject_fee_types.universityId, uni.id), isNull(subject_fee_types.universityId)) : undefined)
    .orderBy(subject_fee_types.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

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
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
    const [row] = await db.select({ universityId: subject_fee_types.universityId })
      .from(subject_fee_types).where(eq(subject_fee_types.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: 'رکورد یافت نشد' }, { status: 404 });
    if (row.universityId !== null && row.universityId !== uni.id) {
      return NextResponse.json({ error: 'رکورد متعلق به دانشگاه دیگری است' }, { status: 403 });
    }
    await db.update(subject_fee_types).set({
      code, title,
      kind: kind || 'ADDITIVE',
      fixedAmount: String(fAmount || 0),
      variablePercent: String(vPercent || 0),
      appliesTo: appliesTo || 'BOTH',
      isActive: isActive ? 1 : 0,
      note: note || null,
    }).where(and(
      eq(subject_fee_types.id, id),
      or(eq(subject_fee_types.universityId, uni.id), isNull(subject_fee_types.universityId)),
    ));
    return NextResponse.json({ ok: true, id });
  }

  // ایجاد
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
  const [ins] = await db.insert(subject_fee_types).values({
    universityId: uni.id,
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
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

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
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
  const [row] = await db.select({ universityId: subject_fee_types.universityId })
    .from(subject_fee_types).where(eq(subject_fee_types.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'رکورد یافت نشد' }, { status: 404 });
  if (row.universityId !== null && row.universityId !== uni.id) {
    return NextResponse.json({ error: 'رکورد متعلق به دانشگاه دیگری است' }, { status: 403 });
  }

  await db.delete(subject_fee_types).where(and(
    eq(subject_fee_types.id, id),
    or(eq(subject_fee_types.universityId, uni.id), isNull(subject_fee_types.universityId)),
  ));
  return NextResponse.json({ ok: true });
}

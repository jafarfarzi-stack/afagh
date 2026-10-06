import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { tuition_coefficients, academic_terms } from '@/db/schema';
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
    .where(uni ? or(eq(tuition_coefficients.universityId, uni.id), isNull(tuition_coefficients.universityId)) : undefined)
    .orderBy(tuition_coefficients.id);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

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
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
  if (term.universityId !== null && term.universityId !== uni.id) {
    return NextResponse.json({ error: 'ترم متعلق به دانشگاه دیگری است' }, { status: 403 });
  }
  const uniScope = or(eq(tuition_coefficients.universityId, uni.id), isNull(tuition_coefficients.universityId));

  // upsert: اگر قبلاً ضریبی برای این ترم تعریف شده، به‌روز کن
  const [existing] = await db
    .select({ id: tuition_coefficients.id })
    .from(tuition_coefficients)
    .where(and(eq(tuition_coefficients.termId, termId), uniScope))
    .limit(1);

  if (existing) {
    await db.update(tuition_coefficients)
      .set({
        variableCoefficient: String(vCoeff),
        fixedCoefficient: String(fCoeff),
        note: note || null,
        updatedAt: new Date(),
      })
      .where(and(eq(tuition_coefficients.id, existing.id), uniScope));
    return NextResponse.json({ ok: true, id: existing.id });
  }

  const [ins] = await db.insert(tuition_coefficients).values({
    universityId: uni.id,
    termId,
    variableCoefficient: String(vCoeff),
    fixedCoefficient: String(fCoeff),
    note: note || null,
  }).returning({ id: tuition_coefficients.id });

  return NextResponse.json({ ok: true, id: ins.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 });
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
  const [row] = await db.select({ universityId: tuition_coefficients.universityId })
    .from(tuition_coefficients).where(eq(tuition_coefficients.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'رکورد یافت نشد' }, { status: 404 });
  if (row.universityId !== null && row.universityId !== uni.id) {
    return NextResponse.json({ error: 'رکورد متعلق به دانشگاه دیگری است' }, { status: 403 });
  }

  await db.delete(tuition_coefficients).where(and(
    eq(tuition_coefficients.id, id),
    or(eq(tuition_coefficients.universityId, uni.id), isNull(tuition_coefficients.universityId)),
  ));
  return NextResponse.json({ ok: true });
}

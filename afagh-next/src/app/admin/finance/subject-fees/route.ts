import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { subject_fee_types, student_subject_fees } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { assertCsrf } from '@/lib/security';
import { appendAudit } from '@/lib/audit';

const FINANCE = ['ADMIN', 'FINANCE_EXPERT', 'FINANCE'];
const SUBJECT_FEE_KINDS = ['ADDITIVE', 'DEDUCTIVE'];
const SUBJECT_FEE_APPLIES_TO = ['BOTH', 'FIXED', 'VARIABLE'];
const MAX_SUBJECT_FEE_RIALS = 10_000_000_000;

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
  // 🔒 CSRF: همانند بقیهٔ هندلرهای تغییردهندهٔ پنل مالی
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'بدنهٔ درخواست نامعتبر است.' }, { status: 400 });
  }
  const { id, code, title, kind, fixedAmount, variablePercent, appliesTo, isActive, note } = (body ?? {}) as Record<string, unknown>;

  if (!code || !title) return NextResponse.json({ error: 'کد و عنوان الزامی است' }, { status: 400 });
  if (String(code).length > 40 || String(title).length > 150) {
    return NextResponse.json({ error: 'طول کد یا عنوان بیش از حد مجاز است' }, { status: 400 });
  }
  const kindValue = String(kind || 'ADDITIVE');
  if (!SUBJECT_FEE_KINDS.includes(kindValue as (typeof SUBJECT_FEE_KINDS)[number])) {
    return NextResponse.json({ error: 'نوع مبلغ موضوعی نامعتبر است' }, { status: 400 });
  }
  const appliesToValue = String(appliesTo || 'BOTH');
  if (!SUBJECT_FEE_APPLIES_TO.includes(appliesToValue as (typeof SUBJECT_FEE_APPLIES_TO)[number])) {
    return NextResponse.json({ error: 'محدودهٔ اعمال نامعتبر است' }, { status: 400 });
  }

  const vPercent = Number(variablePercent);
  const fAmount = fixedAmount === undefined || fixedAmount === null || fixedAmount === '' ? 0 : Number(fixedAmount);
  if (Number.isFinite(vPercent) && (vPercent < 0 || vPercent > 100)) {
    return NextResponse.json({ error: 'درصد متغیر باید بین ۰ تا ۱۰۰ باشد' }, { status: 400 });
  }
  if (!Number.isSafeInteger(fAmount) || fAmount < 0 || fAmount > MAX_SUBJECT_FEE_RIALS) {
    return NextResponse.json({ error: 'مبلغ ثابت باید عدد صحیح ریال بین ۰ تا ۱۰٬۰۰۰٬۰۰۰٬۰۰۰ باشد' }, { status: 400 });
  }

  const idNum = id != null && id !== '' ? Number(id) : 0;
  if (idNum) {
    // ویرایش
    const uni = await getCurrentUniversity().catch(() => null);
    if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
    const [row] = await db.select({ universityId: subject_fee_types.universityId })
      .from(subject_fee_types).where(eq(subject_fee_types.id, idNum)).limit(1);
    if (!row) return NextResponse.json({ error: 'رکورد یافت نشد' }, { status: 404 });
    if (row.universityId !== null && row.universityId !== uni.id) {
      return NextResponse.json({ error: 'رکورد متعلق به دانشگاه دیگری است' }, { status: 403 });
    }
    await db.transaction(async (tx) => {
      await tx.update(subject_fee_types).set({
        code: String(code),
        title: String(title),
        kind: kindValue,
        fixedAmount: String(fAmount),
        variablePercent: String(vPercent || 0),
        appliesTo: appliesToValue,
        isActive: isActive ? 1 : 0,
        note: note ? String(note) : null,
      }).where(and(
        eq(subject_fee_types.id, idNum),
        or(eq(subject_fee_types.universityId, uni.id), isNull(subject_fee_types.universityId)),
      ));
      await appendAudit(tx, {
        actorUserId: auth.id ?? null,
        action: 'FINANCE_SUBJECT_FEE_TYPE_UPDATED',
        entityType: 'subject_fee_types',
        entityId: idNum,
        details: JSON.stringify({ code, kind: kindValue, appliesTo: appliesToValue, fixedAmount: fAmount }),
      });
    });
    return NextResponse.json({ ok: true, id: idNum });
  }

  // ایجاد
  const uni = await getCurrentUniversity().catch(() => null);
  if (!uni) return NextResponse.json({ error: 'دانشگاه فعال نامشخص است' }, { status: 400 });
  const ins = await db.transaction(async (tx) => {
    const [created] = await tx.insert(subject_fee_types).values({
      universityId: uni.id,
      code: String(code),
      title: String(title),
      kind: kindValue,
      fixedAmount: String(fAmount),
      variablePercent: String(vPercent || 0),
      appliesTo: appliesToValue,
      isActive: isActive ? 1 : 0,
      note: note ? String(note) : null,
    }).returning({ id: subject_fee_types.id });
    await appendAudit(tx, {
      actorUserId: auth.id ?? null,
      action: 'FINANCE_SUBJECT_FEE_TYPE_CREATED',
      entityType: 'subject_fee_types',
      entityId: created.id,
      details: JSON.stringify({ code, kind: kindValue, appliesTo: appliesToValue, fixedAmount: fAmount }),
    });
    return created;
  });

  return NextResponse.json({ ok: true, id: ins.id });
}

export async function DELETE(req: NextRequest) {
  // 🔒 CSRF: حذف هم مثل ثبت، فقط از صفحهٔ مالی و با توکن معتبر
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 });

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

  await db.transaction(async (tx) => {
    await tx.delete(subject_fee_types).where(and(
      eq(subject_fee_types.id, id),
      or(eq(subject_fee_types.universityId, uni.id), isNull(subject_fee_types.universityId)),
    ));
    await appendAudit(tx, {
      actorUserId: auth.id ?? null,
      action: 'FINANCE_SUBJECT_FEE_TYPE_DELETED',
      entityType: 'subject_fee_types',
      entityId: id,
      details: JSON.stringify({ subjectFeeTypeId: id }),
    });
  });
  return NextResponse.json({ ok: true });
}

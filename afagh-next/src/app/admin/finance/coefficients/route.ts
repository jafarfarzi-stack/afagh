import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { tuition_coefficients, academic_terms } from '@/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getCurrentUniversity } from '@/lib/university-scope';
import { assertCsrf } from '@/lib/security';
import { appendAudit } from '@/lib/audit';

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
  // 🔒 CSRF: کوکی نشست روی HTTPS با SameSite=None ارسال می‌شود؛ بدون این گارد
  // یک صفحهٔ مهاجم می‌توانست با درخواست ساده ضریب شهریه را تغییر دهد.
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
  const { termId, variableCoefficient, fixedCoefficient, note } = (body ?? {}) as Record<string, unknown>;

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
  // 🔒 سقف تغییر هر فراخوانی ±۲۰٪ (دفاع در برابر جهش ناگهانیِ ضریب شهریهٔ کل
  // ترم) + ثبت حسابرسی هر upsert. بازهٔ مجاز ۰.۵ تا ۵ حفظ شده است.
  const res = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: tuition_coefficients.id,
        variableCoefficient: tuition_coefficients.variableCoefficient,
        fixedCoefficient: tuition_coefficients.fixedCoefficient,
      })
      .from(tuition_coefficients)
      .where(and(eq(tuition_coefficients.termId, termId), uniScope))
      .limit(1)
      .for('update');

    if (existing) {
      const oldV = Number(existing.variableCoefficient);
      const oldF = Number(existing.fixedCoefficient);
      for (const [label, oldVv, newVv] of [['متغیر', oldV, vCoeff], ['ثابت', oldF, fCoeff]] as const) {
        if (Number.isFinite(oldVv) && oldVv > 0) {
          const ratio = newVv / oldVv;
          if (ratio < 0.8 || ratio > 1.2) {
            throw new Error(`تغییر ضریب ${label} در هر مرحله حداکثر ±۲۰٪ مجاز است (مقدار فعلی ${oldVv})؛ برای تغییر بزرگ‌تر در چند مرحله اقدام کنید`);
          }
        }
      }
      await tx.update(tuition_coefficients)
        .set({
          variableCoefficient: String(vCoeff),
          fixedCoefficient: String(fCoeff),
          note: note || null,
          updatedAt: new Date(),
        })
        .where(and(eq(tuition_coefficients.id, existing.id), uniScope));
      await appendAudit(tx, {
        actorUserId: auth.id ?? null,
        action: 'FINANCE_COEFFICIENT_UPDATED',
        entityType: 'tuition_coefficients',
        entityId: existing.id,
        details: JSON.stringify({ termId, oldV, oldF, newV: vCoeff, newF: fCoeff }),
      });
      return { ok: true as const, id: existing.id };
    }

    const [ins] = await tx.insert(tuition_coefficients).values({
      universityId: uni.id,
      termId,
      variableCoefficient: String(vCoeff),
      fixedCoefficient: String(fCoeff),
      note: note || null,
    }).returning({ id: tuition_coefficients.id });
    await appendAudit(tx, {
      actorUserId: auth.id ?? null,
      action: 'FINANCE_COEFFICIENT_CREATED',
      entityType: 'tuition_coefficients',
      entityId: ins.id,
      details: JSON.stringify({ termId, newV: vCoeff, newF: fCoeff }),
    });
    return { ok: true as const, id: ins.id };
  }).catch((e: unknown) => ({ ok: false as const, error: (e as Error)?.message || 'خطا در ذخیرهٔ ضریب' }));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

  return NextResponse.json(res);
}

export async function DELETE(req: NextRequest) {
  // 🔒 CSRF: هم‌مبدأسنجی درخواست (DELETE هم تغییردهنده است)
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const auth = await checkFinanceAuth();
  if (!auth) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'شناسه الزامی است' }, { status: 400 });
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

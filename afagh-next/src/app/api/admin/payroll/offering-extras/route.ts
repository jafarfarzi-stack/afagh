import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { db } from '@/db';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { offering_payroll_extras } from '@/db/schema-payroll-plus';
import { getCurrentUniversity } from '@/lib/university-scope';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger({ mod: 'admin.payroll.offering-extras' });
const WRITE_ROLES = ['ADMIN'];

/**
 * PUT — ثبت/برداشتن «نقش دستی تدریس» روی یک ارائه-استاد.
 *  payRoleOverride = کدِ teaching_role_defs؛ خالی ⇒ NULL ⇒ تشخیص خودکار موتور.
 */
export async function PUT(req: NextRequest) {
  assertSameOrigin(req);
  try {
    await requireRole([...WRITE_ROLES]);
    const { searchParams } = new URL(req.url);
    const offeringId = Number(searchParams.get('offeringId'));
    const staffId = Number(searchParams.get('staffId'));
    if (!Number.isInteger(offeringId) || offeringId <= 0 || !Number.isInteger(staffId) || staffId <= 0) {
      return NextResponse.json({ ok: false, error: 'شناسهٔ ارائه یا استاد نامعتبر است.' }, { status: 400 });
    }

    const parsed = z.object({
      payRoleOverride: z.string().trim().max(50).nullable(),
    }).safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'داده ورودی معتبر نیست.' }, { status: 400 });
    }
    const code = parsed.data.payRoleOverride || null;

    // اگر نقش داده شده، باید در کاتالوگ فعال باشد
    if (code) {
      const { teaching_role_defs } = await import('@/db/schema-payroll-plus');
      const [def] = await db
        .select({ id: teaching_role_defs.id, isActive: teaching_role_defs.isActive })
        .from(teaching_role_defs)
        .where(eq(teaching_role_defs.code, code))
        .limit(1);
      if (!def) {
        return NextResponse.json({ ok: false, error: 'این کد نقش در کاتالوگ ثبت نشده است.' }, { status: 400 });
      }
      if (def.isActive !== 1) {
        return NextResponse.json({ ok: false, error: 'این نقش غیرفعال است؛ ابتدا فعالش کنید.' }, { status: 400 });
      }
    }

    const uni = await getCurrentUniversity().catch(() => null);
    const existing = await db
      .select({ id: offering_payroll_extras.id })
      .from(offering_payroll_extras)
      .where(and(
        eq(offering_payroll_extras.offeringId, offeringId),
        eq(offering_payroll_extras.staffId, staffId),
      ))
      .limit(1);

    if (!existing.length) {
      // ردیف بساز (واحد/مبلغ صفر — فقط ظرفِ نقش دستی)
      await db.insert(offering_payroll_extras).values({
        offeringId, staffId,
        extraUnits: '0', flatAmount: 0,
        reason: code ? 'نقش دستی تدریس' : null,
        payRoleOverride: code,
        universityId: uni?.id ?? null,
      });
      return NextResponse.json({ ok: true });
    }

    await db.update(offering_payroll_extras)
      .set({ payRoleOverride: code })
      .where(eq(offering_payroll_extras.id, existing[0].id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('offering-extras PUT failed', err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message || 'خطای ناشناخته' }, { status: 500 });
  }
}
